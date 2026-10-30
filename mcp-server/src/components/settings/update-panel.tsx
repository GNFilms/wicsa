'use client';

import { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  ShieldCheck,
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  Layers,
  History,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SystemInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  hasExecSql: boolean;
  history: Array<{
    installedAt: string;
    filesCount: number;
    backedUpCount: number;
    migrationsApplied: string[];
    migrationsManualCount: number;
  }>;
}

interface InspectResult {
  totalFiles: number;
  files: Array<{
    path: string;
    size: number;
    category: string;
    existsBefore: boolean;
  }>;
  migrations: Array<{ name: string; sqlLength: number }>;
}

interface InstallResult {
  updatedFilesCount: number;
  backedUpCount: number;
  appliedFiles: string[];
  migrationsApplied: string[];
  migrationsFailed: Array<{ name: string; error: string }>;
  manualMigrations: Array<{ name: string; sql: string }>;
}

export function UpdatePanel() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installStep, setInstallStep] = useState<string>('');
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedExecSql, setCopiedExecSql] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch current system information
  const loadSystemInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/update');
      if (res.ok) {
        const data = await res.json();
        setSystemInfo(data);
      }
    } catch (err) {
      console.error('Failed to load system info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSystemInfo();
  }, []);

  // Handle file select
  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      toast.error('Please upload a .zip update package (e.g., update.zip)');
      return;
    }

    setSelectedFile(file);
    setInstallResult(null);
    setInspectResult(null);

    // Run inspection
    try {
      setInspecting(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('action', 'inspect');

      const res = await fetch('/api/admin/update', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Inspection failed');
      }

      setInspectResult(data);
      toast.success(`Package inspected: ${data.totalFiles} files detected.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to inspect package');
      setSelectedFile(null);
    } finally {
      setInspecting(false);
    }
  };

  // Perform Installation
  const handleInstall = async () => {
    if (!selectedFile) return;

    try {
      setInstalling(true);
      setInstallStep('Uploading and verifying update package...');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('action', 'install');

      setInstallStep('Creating safety backup of existing files...');

      const res = await fetch('/api/admin/update', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Installation failed');
      }

      setInstallResult(data);
      toast.success('Update installed successfully!');
      loadSystemInfo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Installation failed');
    } finally {
      setInstalling(false);
      setInstallStep('');
    }
  };

  const copyToClipboard = (text: string, isExec = false) => {
    navigator.clipboard.writeText(text);
    if (isExec) {
      setCopiedExecSql(true);
      setTimeout(() => setCopiedExecSql(false), 2000);
    } else {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    }
    toast.success('SQL copied to clipboard!');
  };

  const execSqlSetupScript = `CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Platform Update
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Safely upgrade Wicsa features, user interface components, and apply database migrations without touching existing customer data, contacts, or chat history.
        </p>
      </div>

      {/* System Status Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="size-4 text-primary" />
            Current Version
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            v{systemInfo?.version || '0.8.0'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Node {systemInfo?.nodeVersion || process.version} • {systemInfo?.platform || 'windows'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Database className="size-4 text-emerald-500" />
            Database Auto-Migration
          </div>
          <div className="mt-2 flex items-center gap-2">
            {systemInfo?.hasExecSql ? (
              <Badge variant="outline" className="border-emerald-600/40 bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="mr-1 size-3" /> Enabled (Auto-run)
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-600/40 bg-amber-500/10 text-amber-300">
                <AlertTriangle className="mr-1 size-3" /> Ready for Setup
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {systemInfo?.hasExecSql
              ? 'New migrations run automatically upon install.'
              : 'One-time 5-line function setup available below.'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Data Protection
          </div>
          <div className="mt-2 text-sm font-semibold text-foreground">
            100% Non-Destructive
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            All files are backed up to <code>.update_backups/</code> before overwriting.
          </p>
        </div>
      </div>

      {/* Disaster Recovery & Reverse Info Banner */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 text-emerald-400" />
            Disaster Recovery & Emergency Rollback
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            If an update ever causes an unexpected error or the platform becomes unreachable, you can open{' '}
            <code className="text-foreground font-semibold">/reverse.php</code> to view crash error reports and restore the previous version instantly.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                toast.loading('Creating instant backup snapshot...');
                const fd = new FormData();
                fd.append('action', 'backup');
                fd.append('pin', 'wicsa-restore');
                const res = await fetch('/reverse.php', { method: 'POST', body: fd });
                if (res.ok) {
                  toast.dismiss();
                  toast.success('Instant backup snapshot created!');
                  loadSystemInfo();
                } else {
                  throw new Error('Failed');
                }
              } catch {
                toast.dismiss();
                toast.error('Failed to create backup.');
              }
            }}
            className="text-xs"
          >
            Create Backup Snapshot
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open('/reverse.php', '_blank')}
            className="text-xs gap-1"
          >
            Open Reverse Console <ExternalLink className="size-3" />
          </Button>
        </div>
      </div>

      {/* Upload Zone */}
      {!installResult && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground">
            Install Update Package
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload <code>update.zip</code> containing the updated application code and migrations.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileChange(e.dataTransfer.files?.[0] || null);
              }}
              className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UploadCloud className="size-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                Click to upload or drag & drop <code>update.zip</code>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                ZIP archive with updated platform files & migrations
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileArchive className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedFile.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Ready to install
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    setInspectResult(null);
                  }}
                  disabled={installing}
                >
                  Change
                </Button>
              </div>

              {/* Inspection Preview */}
              {inspecting && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <RefreshCw className="size-3.5 animate-spin text-primary" />
                  Analyzing package contents...
                </div>
              )}

              {inspectResult && (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Package Inspection Summary
                    </span>
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      {inspectResult.totalFiles} files to update
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded border border-border/50 bg-background/50 p-2">
                      <span className="text-muted-foreground">Components:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {inspectResult.files.filter((f) => f.category === 'component').length}
                      </span>
                    </div>
                    <div className="rounded border border-border/50 bg-background/50 p-2">
                      <span className="text-muted-foreground">Routes / APIs:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {inspectResult.files.filter((f) => f.category === 'route').length}
                      </span>
                    </div>
                    <div className="rounded border border-border/50 bg-background/50 p-2">
                      <span className="text-muted-foreground">Libraries / Engine:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {inspectResult.files.filter((f) => f.category === 'library').length}
                      </span>
                    </div>
                    <div className="rounded border border-border/50 bg-background/50 p-2">
                      <span className="text-muted-foreground">DB Migrations:</span>{' '}
                      <span className="font-semibold text-foreground">
                        {inspectResult.migrations.length}
                      </span>
                    </div>
                  </div>

                  {inspectResult.migrations.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Detected migrations:</span>{' '}
                      {inspectResult.migrations.map((m) => m.name).join(', ')}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      onClick={handleInstall}
                      disabled={installing}
                      className="gap-2"
                    >
                      {installing ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          Installing Update...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-4" />
                          Install Update Now
                        </>
                      )}
                    </Button>
                  </div>

                  {installing && installStep && (
                    <div className="text-xs text-primary font-medium flex items-center gap-2 pt-1">
                      <RefreshCw className="size-3 animate-spin" />
                      {installStep}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Installation Results */}
      {installResult && (
        <div className="rounded-xl border border-emerald-600/40 bg-emerald-500/5 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Update Successfully Applied!
              </h3>
              <p className="text-xs text-muted-foreground">
                {installResult.updatedFilesCount} files updated • {installResult.backedUpCount} original files safely archived in backup.
              </p>
            </div>
          </div>

          {/* Database migration status */}
          {installResult.migrationsApplied.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3 text-xs text-emerald-400">
              ✓ Database migrations automatically executed:{' '}
              <span className="font-mono">{installResult.migrationsApplied.join(', ')}</span>
            </div>
          )}

          {/* If manual SQL is required */}
          {installResult.manualMigrations.length > 0 && (
            <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300">
                  Database Migrations Ready to Run in Supabase:
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(installResult.manualMigrations.map((m) => m.sql).join('\n\n'))
                  }
                  className="h-7 text-xs gap-1"
                >
                  {copiedSql ? <Check className="size-3" /> : <Copy className="size-3" />}
                  Copy SQL
                </Button>
              </div>
              <pre className="max-h-40 overflow-y-auto rounded bg-background p-2 font-mono text-[11px] text-muted-foreground">
                {installResult.manualMigrations.map((m) => `-- ${m.name}\n${m.sql}`).join('\n\n')}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="size-4" />
              Reload Application
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedFile(null);
                setInspectResult(null);
                setInstallResult(null);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Automatic Migration Setup Guide (if exec_sql not installed) */}
      {!systemInfo?.hasExecSql && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Database className="size-4 text-primary" />
              Enable 100% Automated Database Migrations
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(execSqlSetupScript, true)}
              className="h-7 text-xs gap-1"
            >
              {copiedExecSql ? <Check className="size-3" /> : <Copy className="size-3" />}
              Copy Setup SQL
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            By running this one-time function in your Supabase SQL Editor, Wicsa will be able to apply future database schema migrations automatically whenever you click <strong>Install Update</strong>.
          </p>
          <pre className="rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
            {execSqlSetupScript}
          </pre>
        </div>
      )}

      {/* Update History */}
      {systemInfo?.history && systemInfo.history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            Recent Updates Installed
          </h3>
          <div className="divide-y divide-border text-xs">
            {systemInfo.history.map((h, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">
                    {new Date(h.installedAt).toLocaleString()}
                  </span>
                  <div className="text-muted-foreground text-[11px]">
                    {h.filesCount} files updated • {h.backedUpCount} files archived
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Success
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

