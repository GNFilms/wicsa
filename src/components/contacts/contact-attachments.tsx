"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Paperclip,
  UploadCloud,
  ClipboardPaste,
  Download,
  Eye,
  Trash2,
  Plus,
  Loader2,
  FileText,
  Image as ImageIcon,
  CreditCard,
  Layers,
  X,
  ExternalLink,
  Link as LinkIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Contact, ContactAttachment } from "@/types";

interface ContactAttachmentsProps {
  contact: Contact | null;
}

const ATTACHMENT_CATEGORIES = [
  { id: "visiting_card", label: "Visiting Card", icon: CreditCard },
  { id: "pamphlet", label: "Pamphlet", icon: FileText },
  { id: "poster", label: "Poster", icon: ImageIcon },
  { id: "banner", label: "Banner", icon: Layers },
  { id: "general", label: "Other Asset", icon: Paperclip },
];

export function ContactAttachments({ contact }: ContactAttachmentsProps) {
  const [attachments, setAttachments] = useState<ContactAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<ContactAttachment | null>(null);

  // Form states inside upload modal
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [category, setCategory] = useState("visiting_card");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAttachments = useCallback(async () => {
    if (!contact?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/attachments`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.attachments) setAttachments(json.attachments);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [contact?.id]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleProcessFile = (file: File) => {
    setSelectedFile(file);
    if (!customName) {
      setCustomName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent | ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleProcessFile(file);
          toast.success("Screenshot captured from clipboard!");
          return;
        }
      }
    }
  }, [customName]);

  const handleSaveUpload = async () => {
    if (!contact?.id || !selectedFile) {
      toast.error("Please select or paste an image first");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);
      if (customName.trim()) {
        formData.append("file_name", customName.trim());
      }

      const res = await fetch(`/api/contacts/${contact.id}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Upload failed");
      }

      const json = await res.json();
      toast.success("Attachment saved successfully!");
      if (json.attachment) {
        setAttachments((prev) => [json.attachment, ...prev]);
      }
      setUploadOpen(false);
      setSelectedFile(null);
      setCustomName("");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveLink = async () => {
    if (!contact?.id || !linkUrl.trim()) {
      toast.error("Please enter a valid URL link");
      return;
    }

    setUploading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: linkUrl.trim(),
          file_name: linkText.trim() || linkUrl.trim(),
          file_type: "link",
          category: category,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to add link");
      }

      const json = await res.json();
      toast.success("Link attachment added successfully!");
      if (json.attachment) {
        setAttachments((prev) => [json.attachment, ...prev]);
      }
      setUploadOpen(false);
      setLinkUrl("");
      setLinkText("");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to add link");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attId: string) => {
    if (!contact?.id) return;
    const ok = window.confirm("Are you sure you want to delete this attachment?");
    if (!ok) return;

    setAttachments((prev) => prev.filter((a) => a.id !== attId));
    try {
      await fetch(`/api/contacts/${contact.id}/attachments?attachmentId=${attId}`, {
        method: "DELETE",
      });
      toast.success("Attachment deleted");
    } catch {
      fetchAttachments();
    }
  };

  const handleDownload = (att: ContactAttachment) => {
    const link = document.createElement("a");
    link.href = att.file_url;
    link.download = att.file_name;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="border-t border-border pt-4">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Paperclip className="h-3.5 w-3.5 text-primary" />
          <span>Attachments & Media</span>
          <span className="text-[10px] text-muted-foreground">({attachments.length})</span>
        </div>
        <Button
          size="sm"
          className="h-6 px-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1"
          onClick={() => {
            setSelectedFile(null);
            setCustomName("");
            setUploadOpen(true);
          }}
        >
          <Plus className="h-3 w-3" />
          Upload
        </Button>
      </div>

      {/* Attachments List / Grid */}
      <div className="space-y-2">
        {attachments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 text-center">
            <p className="text-xs text-muted-foreground italic">No client assets attached</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs border-border/70 hover:bg-muted"
              onClick={() => {
                setSelectedFile(null);
                setCustomName("");
                setUploadOpen(true);
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Pamphlet, Poster or Visiting Card
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {attachments.map((att) => {
              const isImage = att.file_type?.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(att.file_url);
              const catMeta = ATTACHMENT_CATEGORIES.find((c) => c.id === att.category) || ATTACHMENT_CATEGORIES[4];
              const CatIcon = catMeta.icon;

              return (
                <div
                  key={att.id}
                  className="group flex items-center justify-between gap-2.5 rounded-lg border border-border/70 bg-card p-2 text-xs transition-colors hover:border-primary/40 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Thumbnail preview */}
                    <div
                      onClick={() => setPreviewItem(att)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted/60 border border-border/60 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      title="Click to preview"
                    >
                      {isImage ? (
                        <img src={att.file_url} alt={att.file_name} className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p
                        onClick={() => setPreviewItem(att)}
                        className="font-medium truncate text-foreground hover:text-primary cursor-pointer"
                        title={att.file_name}
                      >
                        {att.file_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.2 font-medium">
                          <CatIcon className="h-2.5 w-2.5 text-primary" />
                          {catMeta.label}
                        </span>
                        <span>{new Date(att.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(att)}
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(att)}
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(att.id)}
                      className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              Attach Client Asset
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2" onPaste={handlePaste}>
            {/* Category selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Asset Category</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {ATTACHMENT_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSel = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs transition-all ${
                        isSel
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                          : "border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[11px] leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drag & drop or browse */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleProcessFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : selectedFile
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleProcessFile(e.target.files[0]);
                  }
                }}
              />
              <UploadCloud className="h-7 w-7 text-primary mb-1.5" />
              {selectedFile ? (
                <div>
                  <p className="text-xs font-semibold text-emerald-500">Selected: {selectedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-foreground">Click or drag & drop image/pdf</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Pamphlet, Poster, Visiting Card, Banner</p>
                </div>
              )}
            </div>

            {/* Click & Paste Screenshot Area */}
            <div
              tabIndex={0}
              onPaste={handlePaste}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 p-2.5 text-xs text-muted-foreground hover:border-primary/40 focus:border-primary focus:bg-primary/5 focus:outline-none transition-all cursor-pointer"
            >
              <ClipboardPaste className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Or Paste Screenshot</p>
                <p className="text-[11px]">Click here and press <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono border">Ctrl+V</kbd></p>
              </div>
            </div>

            {/* Custom Name */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Asset Label / Title</Label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Front Visiting Card, Diwali Poster 2026..."
                className="text-xs"
              />
            </div>

            {/* OR Divider matching reference screenshot */}
            <div className="relative my-2 text-center text-xs">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <span className="relative bg-card px-2 uppercase text-[10px] font-semibold text-muted-foreground">
                OR
              </span>
            </div>

            {/* Paste Link Section */}
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-foreground">Paste a link</Label>
                <div className="relative">
                  <LinkIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://drive.google.com/... or https://..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-foreground">Display text</Label>
                <Input
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Text to display"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUploadOpen(false);
                setSelectedFile(null);
                setLinkUrl("");
                setLinkText("");
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            {linkUrl.trim() ? (
              <Button size="sm" onClick={handleSaveLink} disabled={uploading} className="gap-1.5">
                {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add Link
              </Button>
            ) : (
              <Button size="sm" onClick={handleSaveUpload} disabled={uploading || !selectedFile} className="gap-1.5">
                {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Attachment
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox Preview Modal */}
      {previewItem && (
        <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] bg-card p-4 overflow-hidden flex flex-col">
            <DialogHeader className="flex flex-row items-center justify-between border-b pb-2">
              <DialogTitle className="text-sm font-semibold truncate max-w-md">
                {previewItem.file_name}
              </DialogTitle>
              <div className="flex items-center gap-2 pr-6">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(previewItem)}
                  className="h-7 text-xs gap-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                <a
                  href={previewItem.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Open original"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-black/5 rounded-lg my-2">
              <img
                src={previewItem.file_url}
                alt={previewItem.file_name}
                className="max-h-[70vh] max-w-full object-contain rounded"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
