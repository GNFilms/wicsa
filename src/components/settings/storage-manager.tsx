'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  HardDrive,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Search,
  RefreshCw,
  AlertTriangle,
  FileVideo,
  FileImage,
  FileAudio,
  FileText,
  File as FileIcon,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface StorageFile {
  id: string;
  name: string;
  path: string;
  bucket: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt?: string;
  publicUrl: string;
}

interface StorageApiResponse {
  success: boolean;
  files: StorageFile[];
  totalFiles: number;
  totalSizeBytes: number;
  bucketBreakdown: Record<string, { count: number; sizeBytes: number }>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('video/')) return <FileVideo className="size-5 text-purple-500" />;
  if (mimeType.startsWith('image/')) return <FileImage className="size-5 text-blue-500" />;
  if (mimeType.startsWith('audio/')) return <FileAudio className="size-5 text-amber-500" />;
  if (mimeType.includes('pdf') || mimeType.includes('text'))
    return <FileText className="size-5 text-emerald-500" />;
  return <FileIcon className="size-5 text-muted-foreground" />;
}

export function StorageManager() {
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [bucketStats, setBucketStats] = useState<Record<string, { count: number; sizeBytes: number }>>({});
  const [search, setSearch] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'size_desc' | 'size_asc' | 'date_desc' | 'name_asc'>('size_desc');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<StorageFile | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/storage/files', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch storage files');
      const data: StorageApiResponse = await res.json();
      setFiles(data.files || []);
      setTotalSize(data.totalSizeBytes || 0);
      setBucketStats(data.bucketBreakdown || {});
      setSelectedPaths(new Set());
    } catch (err: unknown) {
      console.error(err);
      toast.error('Could not load storage files. Please check network/permissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    toast.success('Public URL copied to clipboard');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDeleteSingle = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      const res = await fetch('/api/storage/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: deleteTarget.bucket, path: deleteTarget.path }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete file');
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      await fetchFiles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPaths.size === 0) return;
    try {
      setIsDeleting(true);
      const itemsToDelete = files
        .filter((f) => selectedPaths.has(`${f.bucket}:${f.path}`))
        .map((f) => ({ bucket: f.bucket, path: f.path }));

      const res = await fetch('/api/storage/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: itemsToDelete }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete files');
      toast.success(`Successfully deleted ${data.deletedCount || itemsToDelete.length} files`);
      setBulkDeleteOpen(false);
      setSelectedPaths(new Set());
      await fetchFiles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredFiles.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredFiles.map((f) => `${f.bucket}:${f.path}`)));
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredFiles = useMemo(() => {
    let result = files;

    if (selectedBucket !== 'all') {
      result = result.filter((f) => f.bucket === selectedBucket);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
      );
    }

    return result.sort((a, b) => {
      if (sortBy === 'size_desc') return b.size - a.size;
      if (sortBy === 'size_asc') return a.size - b.size;
      if (sortBy === 'date_desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [files, selectedBucket, search, sortBy]);

  const totalFilteredSize = useMemo(() => {
    return filteredFiles.reduce((acc, f) => acc + f.size, 0);
  }, [filteredFiles]);

  return (
    <div className="space-y-6">
      {/* Overview & Egress Warning Card */}
      <Card className="p-6 border-border bg-card space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HardDrive className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Storage & Media Manager</h2>
              <p className="text-sm text-muted-foreground">
                Manage, inspect, and delete media files stored in your Supabase Storage buckets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchFiles}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Egress Quota Alert Notice */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-400">Supabase Bandwidth (Egress) Notice & Tips</p>
            <p className="text-muted-foreground leading-relaxed">
              Supabase free tier provides a <strong>5 GB/month cached egress limit</strong>. Sending high-resolution
              videos directly through WhatsApp automations exhausts this quota quickly.
              To avoid bandwidth overages, delete large stored videos below and consider using
              direct external video URLs (e.g. YouTube, Cloudinary, Vimeo, or external S3) in your automation flows.
            </p>
          </div>
        </div>

        {/* Storage Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="rounded-lg bg-muted/40 p-3 border border-border">
            <div className="text-[11px] font-medium text-muted-foreground uppercase">Total Used Storage</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{formatBytes(totalSize)}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border">
            <div className="text-[11px] font-medium text-muted-foreground uppercase">Total Files</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{files.length}</div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border">
            <div className="text-[11px] font-medium text-muted-foreground uppercase">Flow Media</div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {formatBytes(bucketStats['flow-media']?.sizeBytes || 0)}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                ({bucketStats['flow-media']?.count || 0})
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 border border-border">
            <div className="text-[11px] font-medium text-muted-foreground uppercase">Chat Media</div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {formatBytes(bucketStats['chat-media']?.sizeBytes || 0)}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                ({bucketStats['chat-media']?.count || 0})
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search file name or path..."
              className="pl-8 text-xs h-9 bg-muted/40 border-border"
            />
          </div>

          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none"
          >
            <option value="all">All Buckets</option>
            <option value="flow-media">flow-media</option>
            <option value="chat-media">chat-media</option>
            <option value="avatars">avatars</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none"
          >
            <option value="size_desc">Largest First</option>
            <option value="size_asc">Smallest First</option>
            <option value="date_desc">Newest First</option>
            <option value="name_asc">Name (A-Z)</option>
          </select>
        </div>

        {selectedPaths.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
            className="gap-1.5 shrink-0"
          >
            <Trash2 className="size-3.5" />
            Delete Selected ({selectedPaths.size})
          </Button>
        )}
      </div>

      {/* File List */}
      <Card className="border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20 text-xs font-medium text-muted-foreground">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={filteredFiles.length > 0 && selectedPaths.size === filteredFiles.length}
              onChange={toggleSelectAll}
              className="size-4 rounded border-border"
            />
            <span>File Name & Info ({filteredFiles.length} files · {formatBytes(totalFilteredSize)})</span>
          </div>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary mb-2" />
            Scanning storage buckets...
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No files found matching current filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredFiles.map((file) => {
              const fileKey = `${file.bucket}:${file.path}`;
              const isSelected = selectedPaths.has(fileKey);
              const isLarge = file.size > 5 * 1024 * 1024; // > 5MB

              return (
                <div
                  key={fileKey}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 gap-3 transition-colors ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(fileKey)}
                      className="size-4 rounded border-border mt-1 sm:mt-0 shrink-0"
                    />
                    <div className="shrink-0 p-2 rounded-lg bg-muted/60 border border-border">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate max-w-md">
                          {file.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider py-0 px-1.5">
                          {file.bucket}
                        </Badge>
                        {isLarge && (
                          <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-normal">
                            Large ({formatBytes(file.size)})
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span>{formatBytes(file.size)}</span>
                        <span>•</span>
                        <span className="truncate max-w-xs">{file.path}</span>
                        <span>•</span>
                        <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLink(file.publicUrl)}
                      className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      title="Copy Public Link"
                    >
                      {copiedUrl === file.publicUrl ? (
                        <Check className="size-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      <span className="hidden md:inline">Copy Link</span>
                    </Button>

                    <a
                      href={file.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md font-medium transition-colors hover:bg-muted h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      title="Open in new tab"
                    >
                      <ExternalLink className="size-3.5" />
                      <span className="hidden md:inline">Open</span>
                    </a>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(file)}
                      className="h-8 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10"
                      title="Delete file"
                    >
                      <Trash2 className="size-3.5" />
                      <span className="hidden md:inline">Delete</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Single Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm text-destructive">
              <ShieldAlert className="size-4" />
              Confirm Delete File
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground space-y-2">
            <p>
              Are you sure you want to permanently delete{' '}
              <strong className="text-foreground">{deleteTarget?.name}</strong>?
            </p>
            <p className="text-muted-foreground">
              Size: <strong>{deleteTarget ? formatBytes(deleteTarget.size) : ''}</strong> in bucket{' '}
              <strong>{deleteTarget?.bucket}</strong>.
            </p>
            <p className="text-amber-500">
              This action cannot be undone. Any active chat or flow node referencing this URL will no longer be able to load it.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSingle}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm text-destructive">
              <ShieldAlert className="size-4" />
              Confirm Bulk Delete ({selectedPaths.size} files)
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground space-y-2">
            <p>
              You are about to permanently delete <strong>{selectedPaths.size}</strong> files from storage.
            </p>
            <p className="text-amber-500">
              This will free up storage space immediately. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete {selectedPaths.size} Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

