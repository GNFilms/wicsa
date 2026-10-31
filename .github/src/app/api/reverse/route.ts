import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APP_ROOT = process.cwd();
const BACKUPS_DIR = path.join(APP_ROOT, '.update_backups');
const HISTORY_FILE = path.join(BACKUPS_DIR, 'history.json');
const ERROR_LOG_FILE = path.join(BACKUPS_DIR, 'error.log');

const RECOVERY_PIN = process.env.RECOVERY_PIN || 'wicsa-restore';

function copyDirRecursive(src: string, dst: string): number {
  let count = 0;
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      count++;
    }
  }
  return count;
}

function getBackupsList() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  const entries = fs.readdirSync(BACKUPS_DIR, { withFileTypes: true });
  const list = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const stats = fs.statSync(path.join(BACKUPS_DIR, e.name));
      return {
        name: e.name,
        time: stats.mtime.toISOString().replace('T', ' ').slice(0, 19),
      };
    });
  return list.sort((a, b) => b.name.localeCompare(a.name));
}

function renderHtml(options: {
  message?: string;
  messageType?: 'success' | 'error' | 'info';
  pin?: string;
  authorized: boolean;
  backups: Array<{ name: string; time: string }>;
  errorLog?: string;
}) {
  const { message, messageType = 'info', pin = '', authorized, backups, errorLog } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wicsa Disaster Recovery & Restore Console</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; padding: 24px; line-height: 1.5; }
        .container { max-width: 900px; margin: 0 auto; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        h1 { font-size: 24px; color: #f8fafc; margin-bottom: 6px; }
        h2 { font-size: 15px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 12px; }
        .alert { padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
        .alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; }
        .alert-error { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; }
        .alert-info { background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #60a5fa; }
        input[type="text"], input[type="password"] { background: #1e293b; border: 1px solid #334155; color: #f8fafc; padding: 8px 12px; border-radius: 6px; font-size: 14px; width: 100%; max-width: 320px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #3b82f6; color: white; border: none; padding: 9px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: 0.15s; }
        .btn:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }
        .btn-secondary { background: #334155; color: #e2e8f0; }
        .btn-secondary:hover { background: #475569; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
        th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1e293b; }
        th { color: #64748b; font-weight: 600; }
        pre { background: #050811; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; color: #f87171; font-family: monospace; font-size: 12px; max-height: 240px; overflow: auto; white-space: pre-wrap; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: bold; background: #334155; color: #94a3b8; }
        .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    </style>
</head>
<body>
    <div class="container">
        <div style="margin-bottom: 24px;">
            <h1>🛡️ Wicsa Emergency Disaster Recovery & Restore</h1>
            <p>Standalone emergency console to review error reports, create backups, or rollback the platform if an update caused an issue.</p>
        </div>

        ${message ? `<div class="alert alert-${messageType}">${message}</div>` : ''}

        <!-- Security PIN Form -->
        <div class="card">
            <h2>Authentication</h2>
            <form method="GET" action="/reverse.php" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <input type="password" name="pin" value="${pin}" placeholder="Enter Recovery PIN (default: wicsa-restore)">
                <button type="submit" class="btn btn-secondary">Unlock Actions</button>
                ${authorized ? '<span class="badge badge-green">✓ Authorized</span>' : '<span class="badge">Read-only mode</span>'}
            </form>
        </div>

        <!-- Error Reports -->
        ${errorLog ? `
            <div class="card" style="border-color: #ef4444;">
                <h2 style="color: #f87171;">⚠️ Latest System / Update Error Report</h2>
                <pre>${errorLog}</pre>
            </div>
        ` : ''}

        <!-- Actions -->
        <div class="card">
            <h2>Instant Backup</h2>
            <p>Take a complete on-demand backup snapshot of all code, components, and migrations right now.</p>
            <form method="POST" action="/reverse.php">
                <input type="hidden" name="action" value="backup">
                <input type="hidden" name="pin" value="${pin}">
                <button type="submit" class="btn" ${!authorized ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                    📦 Create Instant Backup Snapshot
                </button>
            </form>
        </div>

        <!-- Available Backups Table -->
        <div class="card">
            <h2>Available Restore Points (${backups.length})</h2>
            <p>Select any backup to restore files to that exact previous state.</p>
            ${backups.length === 0 ? `
                <p style="color: #64748b;">No backups found in <code>.update_backups/</code>.</p>
            ` : `
                <table>
                    <thead>
                        <tr>
                            <th>Backup Name</th>
                            <th>Date Created</th>
                            <th style="text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${backups.map((b) => `
                            <tr>
                                <td style="font-family: monospace; color: #f8fafc;">
                                    ${b.name}
                                </td>
                                <td style="color: #94a3b8;">
                                    ${b.time}
                                </td>
                                <td style="text-align: right;">
                                    <form method="POST" action="/reverse.php" style="display: inline;" onsubmit="return confirm('Are you sure you want to restore this backup? This will overwrite existing files with this version.');">
                                        <input type="hidden" name="action" value="restore">
                                        <input type="hidden" name="backup_name" value="${b.name}">
                                        <input type="hidden" name="pin" value="${pin}">
                                        <button type="submit" class="btn btn-danger" style="padding: 4px 10px; font-size: 11px;" ${!authorized ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                                            ↺ Restore Version
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <!-- Return Link -->
        <div style="text-align: center; margin-top: 16px;">
            <a href="/" class="btn btn-secondary">← Back to Wicsa Dashboard</a>
        </div>
    </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get('pin') || '';
  const authorized = pin === RECOVERY_PIN;

  let errorLog = '';
  if (fs.existsSync(ERROR_LOG_FILE)) {
    try {
      errorLog = fs.readFileSync(ERROR_LOG_FILE, 'utf8');
    } catch {
      // ignore
    }
  }
  if (!errorLog && fs.existsSync(HISTORY_FILE)) {
    try {
      const hist = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      if (Array.isArray(hist) && hist.length > 0) {
        const last = hist[hist.length - 1];
        if (last.migrationsFailed && last.migrationsFailed.length > 0) {
          errorLog = JSON.stringify(last.migrationsFailed, null, 2);
        }
      }
    } catch {
      // ignore
    }
  }

  const backups = getBackupsList();
  const html = renderHtml({
    authorized,
    pin,
    backups,
    errorLog,
  });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const action = (formData.get('action') as string) || '';
  const pin = (formData.get('pin') as string) || '';
  const backupName = (formData.get('backup_name') as string) || '';

  const authorized = pin === RECOVERY_PIN;
  let message = '';
  let messageType: 'success' | 'error' | 'info' = 'info';

  if (!authorized) {
    message = 'Unauthorized: Incorrect recovery PIN.';
    messageType = 'error';
  } else if (action === 'backup') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolder = path.join(BACKUPS_DIR, `manual-backup-${timestamp}`);
    fs.mkdirSync(backupFolder, { recursive: true });

    const filesToBackup = ['src', 'messages', 'supabase', 'package.json', 'all_migrations_combined.sql'];
    let count = 0;

    for (const item of filesToBackup) {
      const srcPath = path.join(APP_ROOT, item);
      const destPath = path.join(backupFolder, item);
      if (fs.existsSync(srcPath)) {
        if (fs.statSync(srcPath).isDirectory()) {
          count += copyDirRecursive(srcPath, destPath);
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
          count++;
        }
      }
    }

    message = `Manual backup created successfully! (${count} files archived to ${path.basename(backupFolder)})`;
    messageType = 'success';
  } else if (action === 'restore') {
    const safeBackupName = path.basename(backupName);
    const targetDir = path.join(BACKUPS_DIR, safeBackupName);

    if (safeBackupName && fs.existsSync(targetDir) && fs.statSync(targetDir).isDirectory()) {
      const restored = copyDirRecursive(targetDir, APP_ROOT);
      message = `Restoration completed successfully! ${restored} files reverted from ${safeBackupName}.`;
      messageType = 'success';
    } else {
      message = 'Selected backup directory does not exist.';
      messageType = 'error';
    }
  }

  const backups = getBackupsList();
  const html = renderHtml({
    message,
    messageType,
    authorized,
    pin,
    backups,
  });

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

