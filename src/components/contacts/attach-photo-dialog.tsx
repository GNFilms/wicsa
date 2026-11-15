"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UploadCloud,
  ClipboardPaste,
  Image as ImageIcon,
  Trash2,
  AlertTriangle,
  Loader2,
  Link as LinkIcon,
  Check,
} from "lucide-react";
import type { Contact } from "@/types";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

interface AttachPhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onPhotoUpdated?: (updatedContact: Contact) => void;
}

export function AttachPhotoDialog({
  open,
  onOpenChange,
  contact,
  onPhotoUpdated,
}: AttachPhotoDialogProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "link">("upload");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedFile(null);
      setSizeError(null);
      setLinkUrl("");
      setPreviewUrl(contact?.avatar_url || null);
    }
  }, [open, contact]);

  // Handle incoming file (from browse or drag & drop)
  const processFile = useCallback((file: File) => {
    setSizeError(null);

    // Validate size (2 MB max)
    if (file.size > MAX_BYTES) {
      setSizeError("bigger image size , Take it's screenshot & paste it here");
      toast.error("File exceeds 2 MB limit");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (JPEG, PNG, WEBP, etc.)");
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  }, []);

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Handle Click & Paste (Clipboard event)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent | ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            toast.success("Screenshot pasted successfully!");
            return;
          }
        }
      }
    },
    [processFile]
  );

  // Global window paste listener while dialog is open
  useEffect(() => {
    if (!open) return;
    const onWindowPaste = (e: ClipboardEvent) => {
      handlePaste(e);
    };
    window.addEventListener("paste", onWindowPaste);
    return () => {
      window.removeEventListener("paste", onWindowPaste);
    };
  }, [open, handlePaste]);

  const handleSave = async () => {
    if (!contact) return;
    setSaving(true);
    setSizeError(null);

    try {
      let res: Response;

      if (activeTab === "link" && linkUrl.trim()) {
        res = await fetch(`/api/contacts/${contact.id}/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avatar_url: linkUrl.trim() }),
        });
      } else if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        res = await fetch(`/api/contacts/${contact.id}/avatar`, {
          method: "POST",
          body: formData,
        });
      } else {
        toast.info("No new photo selected");
        setSaving(false);
        return;
      }

      const json = await res.json();
      if (!res.ok) {
        if (json.error && json.error.includes("bigger image size")) {
          setSizeError(json.error);
        }
        throw new Error(json.error || "Failed to attach photo");
      }

      toast.success("Photo attached successfully!");
      if (onPhotoUpdated && json.contact) {
        onPhotoUpdated(json.contact);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to attach photo");
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!contact) return;
    const ok = window.confirm("Are you sure you want to remove this contact photo?");
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/avatar`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to remove photo");

      toast.success("Photo removed");
      setPreviewUrl(null);
      setSelectedFile(null);
      if (onPhotoUpdated && json.contact) {
        onPhotoUpdated(json.contact);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setSaving(false);
    }
  };

  const displayName = contact?.name || contact?.phone || "Contact";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Attach Photo</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set profile photo for {displayName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Size Limit Alert Warning */}
        {sizeError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold">{sizeError}</p>
              <p className="mt-0.5 text-[11px] text-red-300/80">
                Max size is 2 MB. If your image is too large, take a screenshot of it and press Ctrl+V right here!
              </p>
            </div>
          </div>
        )}

        {/* Current / Staged Avatar Preview */}
        <div className="flex items-center justify-center py-2">
          <div className="relative group">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/60 text-xl font-bold text-muted-foreground ring-4 ring-primary/20 overflow-hidden shadow-inner">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            {contact?.avatar_url && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={saving}
                title="Remove photo"
                className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tab switch: File/Paste vs Link */}
        <div className="flex items-center justify-center gap-1 rounded-lg bg-muted p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              activeTab === "upload"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Upload / Click & Paste
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              activeTab === "link"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Paste Image Link
          </button>
        </div>

        {activeTab === "upload" ? (
          <div className="space-y-3">
            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/jpg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processFile(e.target.files[0]);
                  }
                }}
              />
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Choose a file or drag & drop it here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, JPG, PNG, WEBP, & GIF up to 2 MB
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 pointer-events-none"
              >
                Browse File
              </Button>
            </div>

            {/* Click & Paste Screenshot Area */}
            <div
              ref={pasteAreaRef}
              tabIndex={0}
              onPaste={handlePaste}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground hover:border-primary/40 focus:border-primary focus:bg-primary/5 focus:outline-none transition-all cursor-pointer"
              title="Click here and press Ctrl+V"
            >
              <ClipboardPaste className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Click & paste screenshot</p>
                <p className="text-[11px]">Click here and press <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono border">Ctrl+V</kbd> to paste any copied screenshot</p>
              </div>
            </div>
          </div>
        ) : (
          /* Paste Link Tab */
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Paste photo URL</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    if (e.target.value.trim().startsWith("http")) {
                      setPreviewUrl(e.target.value.trim());
                    }
                  }}
                  placeholder="https://example.com/profile.jpg"
                  className="pl-9 text-xs"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter direct image URL. It will be loaded and saved for this contact.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="mt-2 flex items-center justify-between gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || (!selectedFile && !linkUrl.trim())}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save Photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
