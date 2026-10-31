import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

// Root of the Next.js application
const APP_ROOT = process.cwd();

// Backups directory for safety rollback
const BACKUPS_DIR = path.join(APP_ROOT, '.update_backups');

interface ExtractedFileInfo {
  path: string;
  size: number;
  category: 'component' | 'route' | 'library' | 'migration' | 'config' | 'other';
  existsBefore: boolean;
}

function categorizePath(relPath: string): ExtractedFileInfo['category'] {
  const norm = relPath.replace(/\\/g, '/');
  if (norm.startsWith('supabase/migrations') || norm.endsWith('.sql')) return 'migration';
  if (norm.startsWith('src/components')) return 'component';
  if (norm.startsWith('src/app/api') || norm.startsWith('src/app/(dashboard)')) return 'route';
  if (norm.startsWith('src/lib') || norm.startsWith('src/hooks') || norm.startsWith('src/types')) return 'library';
  if (norm.endsWith('.json') || norm.endsWith('.config.js') || norm.endsWith('.config.ts')) return 'config';
  return 'other';
}

function getAllFilesRecursively(dir: string, baseDir = dir): { path: string; size: number }[] {
  const results: { path: string; size: number }[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const stats = fs.statSync(fullPath);
      results.push({ path: relPath, size: stats.size });
    }
  }
  return results;
}

async function verifyOwnerAccess() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { ok: false, status: 401, error: 'Unauthorized. Please log in.' };
  }

  const admin = supabaseAdmin();
  // Check membership role in account_members
  const { data: member } = await admin
    .from('account_members')
    .select('role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // If role is owner or admin, allow
  if (member?.role === 'owner' || member?.role === 'admin') {
    return { ok: true, user, role: member.role };
  }

  // Fallback: check if user owns an account in accounts table
  const { data: account } = await admin
    .from('accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (account) {
    return { ok: true, user, role: 'owner' };
  }

  // If no account role found but user is authenticated in single-tenant setup
  const { data: anyMember } = await admin.from('account_members').select('id').limit(1);
  if (!anyMember || anyMember.length === 0) {
    return { ok: true, user, role: 'owner' };
  }

  return { ok: false, status: 403, error: 'Access restricted to Account Owners & Admins.' };
}

/**
 * GET /api/admin/update
 * Returns system version, environment info, update history, and whether exec_sql RPC is ready.
 */
export async function GET() {
  const auth = await verifyOwnerAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Read current package.json version
  let version = '0.8.0';
  try {
    const pkgPath = path.join(APP_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) version = pkg.version;
    }
  } catch {
    // ignore
  }

  // Check if exec_sql RPC function exists in Supabase
  let hasExecSql = false;
  try {
    const admin = supabaseAdmin();
    // Test with a harmless comment query
    const { error } = await admin.rpc('exec_sql', { query: 'SELECT 1;' });
    if (!error) {
      hasExecSql = true;
    }
  } catch {
    hasExecSql = false;
  }

  // Read last backup or update history
  let history: Record<string, unknown>[] = [];
  const historyPath = path.join(BACKUPS_DIR, 'history.json');
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    version,
    nodeVersion: process.version,
    platform: process.platform,
    hasExecSql,
    history: history.slice(-5).reverse(),
  });
}

/**
 * POST /api/admin/update
 * Handles zip file inspection and installation.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyOwnerAccess();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const formData = await req.formData();
    const action = (formData.get('action') as string) || 'install'; // 'inspect' | 'install'
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No update package provided.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 22) {
      return NextResponse.json({ error: 'Invalid or empty file.' }, { status: 400 });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wicsa-update-'));
    const zipPath = path.join(tempDir, 'update.zip');
    fs.writeFileSync(zipPath, buffer);

    // Extract to an isolated temp extraction directory
    const extractedDir = path.join(tempDir, 'extracted');
    fs.mkdirSync(extractedDir, { recursive: true });

    // Use tar to extract zip
    try {
      await execFileAsync('tar', ['-xf', zipPath, '-C', extractedDir]);
    } catch (tarErr) {
      // Fallback extraction
      return NextResponse.json(
        { error: `Extraction failed: ${tarErr instanceof Error ? tarErr.message : String(tarErr)}` },
        { status: 500 }
      );
    }

    // Read all extracted files
    const extractedFiles = getAllFilesRecursively(extractedDir);
    if (extractedFiles.length === 0) {
      return NextResponse.json({ error: 'The package contains no files.' }, { status: 400 });
    }

    const fileDetails: ExtractedFileInfo[] = extractedFiles.map((f) => {
      const targetPath = path.join(APP_ROOT, f.path);
      return {
        path: f.path,
        size: f.size,
        category: categorizePath(f.path),
        existsBefore: fs.existsSync(targetPath),
      };
    });

    // Detect migration SQL files
    const migrationFiles = fileDetails.filter((f) => f.category === 'migration');
    const migrationsContent: { name: string; sql: string }[] = [];
    for (const m of migrationFiles) {
      const fullPath = path.join(extractedDir, m.path);
      if (fs.existsSync(fullPath)) {
        migrationsContent.push({
          name: path.basename(m.path),
          sql: fs.readFileSync(fullPath, 'utf8'),
        });
      }
    }

    // If inspect only, return details without modifying live app
    if (action === 'inspect') {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return NextResponse.json({
        ok: true,
        action: 'inspect',
        totalFiles: fileDetails.length,
        files: fileDetails,
        migrations: migrationsContent.map((m) => ({ name: m.name, sqlLength: m.sql.length })),
      });
    }

    // ============================================================
    // ACTION === 'install'
    // ============================================================

    // Step 1: Safety Backup of files that will be overwritten
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = path.join(BACKUPS_DIR, `backup-${timestamp}`);
    fs.mkdirSync(backupFolder, { recursive: true });

    let backedUpCount = 0;
    for (const f of fileDetails) {
      const livePath = path.join(APP_ROOT, f.path);
      if (fs.existsSync(livePath)) {
        const destBackup = path.join(backupFolder, f.path);
        fs.mkdirSync(path.dirname(destBackup), { recursive: true });
        fs.copyFileSync(livePath, destBackup);
        backedUpCount++;
      }
    }

    // Step 2: Copy new files into the live application (preserves all untouched files!)
    let updatedFilesCount = 0;
    const appliedFiles: string[] = [];

    for (const f of fileDetails) {
      // Security check: prevent directory traversal
      const norm = path.normalize(f.path);
      if (norm.startsWith('..') || path.isAbsolute(norm)) continue;
      if (norm.startsWith('.env') || norm === '.git' || norm.startsWith('.git/')) continue;

      const srcPath = path.join(extractedDir, f.path);
      const destPath = path.join(APP_ROOT, f.path);

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      updatedFilesCount++;
      appliedFiles.push(f.path);
    }

    // Step 3: Run Database Migrations if present
    const admin = supabaseAdmin();
    const migrationsApplied: string[] = [];
    const migrationsFailed: { name: string; error: string }[] = [];
    const manualMigrations: { name: string; sql: string }[] = [];

    for (const m of migrationsContent) {
      // Don't rerun all_migrations_combined.sql automatically as it contains initial schemas
      if (m.name === 'all_migrations_combined.sql') continue;

      try {
        const { error: rpcErr } = await admin.rpc('exec_sql', { query: m.sql });
        if (rpcErr) {
          migrationsFailed.push({ name: m.name, error: rpcErr.message });
          manualMigrations.push(m);
        } else {
          migrationsApplied.push(m.name);
        }
      } catch (err) {
        migrationsFailed.push({ name: m.name, error: err instanceof Error ? err.message : String(err) });
        manualMigrations.push(m);
      }
    }

    // Step 4: Record history
    const historyEntry = {
      installedAt: new Date().toISOString(),
      installedBy: auth.user.email || auth.user.id,
      filesCount: updatedFilesCount,
      backedUpCount,
      backupPath: backupFolder,
      migrationsApplied,
      migrationsManualCount: manualMigrations.length,
    };

    let history: Record<string, unknown>[] = [];
    const historyPath = path.join(BACKUPS_DIR, 'history.json');
    if (fs.existsSync(historyPath)) {
      try {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      } catch {
        history = [];
      }
    }
    history.push(historyEntry);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf8');

    // Clean up temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      message: 'Update installed successfully!',
      updatedFilesCount,
      backedUpCount,
      appliedFiles,
      migrationsApplied,
      migrationsFailed,
      manualMigrations: manualMigrations.map((m) => ({ name: m.name, sql: m.sql })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Update failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

