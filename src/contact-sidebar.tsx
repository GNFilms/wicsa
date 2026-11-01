"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addContactTag, deleteContactTag } from "@/lib/contacts/tag-api";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag, CustomField, ContactCustomValue } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Pencil,
  X,
  Loader2,
  Building2,
  Save,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  onContactUpdated?: (updated: Contact) => void;
}

const PRESET_TAG_COLORS = [
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#14b8a6", // Teal
];

export function ContactSidebar({ contact, onContactUpdated }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId, user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [allWorkspaceTags, setAllWorkspaceTags] = useState<Tag[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Edit contact details state
  const [isEditing, setIsEditing] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCompany, setEditCompany] = useState("");

  // Custom fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [editCustomValues, setEditCustomValues] = useState<Record<string, string>>({});

  // Tag popover state
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_TAG_COLORS[0]);
  const [creatingTag, setCreatingTag] = useState(false);

  // Sync edit form with current contact
  useEffect(() => {
    if (contact) {
      setEditName(contact.name ?? "");
      setEditPhone(contact.phone ?? "");
      setEditEmail(contact.email ?? "");
      setEditCompany(contact.company ?? "");
      setIsEditing(false);
    }
  }, [contact?.id, contact?.name, contact?.phone, contact?.email, contact?.company]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, tags, workspace tags, and custom fields in parallel
    const [dealsRes, notesRes, tagsRes, allTagsRes, fieldsRes, customValsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true }),
      supabase
        .from("custom_fields")
        .select("*")
        .order("field_name", { ascending: true }),
      supabase
        .from("contact_custom_values")
        .select("*")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    if (allTagsRes.data) setAllWorkspaceTags(allTagsRes.data as Tag[]);
    if (fieldsRes.data) setCustomFields(fieldsRes.data as CustomField[]);
    if (customValsRes.data) {
      const map: Record<string, string> = {};
      customValsRes.data.forEach((cv: ContactCustomValue) => {
        map[cv.custom_field_id] = cv.value ?? "";
      });
      setCustomValues(map);
      setEditCustomValues(map);
    }
  }, [contact?.id]);

  useEffect(() => {
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    const handle = contact ? contactHandle(contact) : "";
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  // Real-time Save Contact Details
  const handleSaveContactDetails = async () => {
    if (!contact || !contact.id) return;
    if (!editPhone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    setSavingDetails(true);
    try {
      const supabase = createClient();
      const updatedFields = {
        name: editName.trim() || null,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedContact, error: updateErr } = await supabase
        .from("contacts")
        .update(updatedFields)
        .eq("id", contact.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Update custom values
      for (const field of customFields) {
        const newVal = editCustomValues[field.id]?.trim() ?? "";
        const oldVal = customValues[field.id] ?? "";
        if (newVal !== oldVal) {
          const { data: existing } = await supabase
            .from("contact_custom_values")
            .select("id")
            .eq("contact_id", contact.id)
            .eq("custom_field_id", field.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from("contact_custom_values")
              .update({ value: newVal })
              .eq("id", existing.id);
          } else if (newVal) {
            await supabase.from("contact_custom_values").insert({
              contact_id: contact.id,
              custom_field_id: field.id,
              value: newVal,
            });
          }
        }
      }

      setCustomValues({ ...editCustomValues });
      toast.success("Contact details updated successfully");
      setIsEditing(false);

      if (onContactUpdated && updatedContact) {
        onContactUpdated({
          ...contact,
          ...updatedContact,
          tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, user_id: t.user_id, created_at: t.created_at })),
        });
      }
    } catch (err: unknown) {
      console.error("Save contact failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update contact");
    } finally {
      setSavingDetails(false);
    }
  };

  // Real-time Add Tag to Contact
  const handleAddTag = async (tag: Tag) => {
    if (!contact) return;
    if (tags.some((t) => t.id === tag.id)) return;

    try {
      await addContactTag(contact.id, tag.id);
      const newTagEntry = { ...tag, contact_tag_id: `ct-${Date.now()}` };
      const nextTags = [...tags, newTagEntry];
      setTags(nextTags);
      toast.success(`Tag "${tag.name}" added`);

      if (onContactUpdated) {
        onContactUpdated({
          ...contact,
          tags: nextTags.map((t) => ({ id: t.id, name: t.name, color: t.color, user_id: t.user_id, created_at: t.created_at })),
        });
      }
    } catch (err: unknown) {
      console.error("Add tag error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to add tag");
    }
  };

  // Real-time Remove Tag from Contact
  const handleRemoveTag = async (tagId: string, tagName: string) => {
    if (!contact) return;

    try {
      await deleteContactTag(contact.id, tagId);
      const nextTags = tags.filter((t) => t.id !== tagId);
      setTags(nextTags);
      toast.success(`Tag "${tagName}" removed`);

      if (onContactUpdated) {
        onContactUpdated({
          ...contact,
          tags: nextTags.map((t) => ({ id: t.id, name: t.name, color: t.color, user_id: t.user_id, created_at: t.created_at })),
        });
      }
    } catch (err: unknown) {
      console.error("Delete tag error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to remove tag");
    }
  };

  // Inline Create New Tag
  const handleCreateNewTag = async () => {
    if (!newTagName.trim() || !contact) return;
    setCreatingTag(true);
    try {
      const supabase = createClient();
      const { data: createdTag, error } = await supabase
        .from("tags")
        .insert({
          name: newTagName.trim(),
          color: newTagColor,
          account_id: accountId,
          user_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      if (createdTag) {
        setAllWorkspaceTags((prev) => [...prev, createdTag as Tag]);
        await handleAddTag(createdTag as Tag);
        setNewTagName("");
        setTagPopoverOpen(false);
      }
    } catch (err: unknown) {
      console.error("Create tag error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  };

  // Add Note
  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUser = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: currentUser?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
      toast.success("Note added");
    } else {
      toast.error("Failed to add note");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const availableTags = useMemo(() => {
    const assignedIds = new Set(tags.map((t) => t.id));
    return allWorkspaceTags.filter(
      (t) => !assignedIds.has(t.id) && t.name.toLowerCase().includes(tagSearch.toLowerCase())
    );
  }, [allWorkspaceTags, tags, tagSearch]);

  if (!contact) {
    return (
      <div className="flex h-full w-80 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      {/* Header bar with Real-time Edit toggle */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contact Details
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-primary hover:bg-primary/10 hover:text-primary gap-1"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <X className="h-3.5 w-3.5" />
              Cancel
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </>
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Contact Profile Overview */}
          {isEditing ? (
            /* Inline Edit Mode */
            <div className="space-y-3 rounded-lg border border-primary/20 bg-muted/30 p-3">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="text-xs font-medium text-foreground">Edit Contact Info</span>
                <span className="text-[10px] text-muted-foreground">Auto-updates across CRM</span>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Nayak Computer"
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Phone *</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 916266958800"
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Email</Label>
                <Input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Company</Label>
                <Input
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="Company name"
                  className="h-8 text-xs bg-background"
                />
              </div>

              {/* Dynamic Custom Fields in Edit Mode */}
              {customFields.length > 0 && (
                <div className="pt-2 border-t border-border space-y-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Custom Fields</span>
                  {customFields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{field.field_name}</Label>
                      <Input
                        value={editCustomValues[field.id] ?? ""}
                        onChange={(e) =>
                          setEditCustomValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                        placeholder={`Enter ${field.field_name}`}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  className="h-8 flex-1 bg-primary text-xs hover:bg-primary/90 gap-1.5"
                  onClick={handleSaveContactDetails}
                  disabled={savingDetails}
                >
                  {savingDetails ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setIsEditing(false)}
                  disabled={savingDetails}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            /* View Mode */
            <div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold ring-2 ring-primary/20">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={displayName}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <h3 className="mt-3 text-base font-semibold text-foreground">
                  {displayName}
                </h3>
                {contact.company ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Building2 className="h-3 w-3" />
                    {contact.company}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic mt-0.5">No company assigned</p>
                )}
              </div>

              {/* Quick Contact Actions (Phone & Email) */}
              <div className="mt-4 space-y-1.5">
                <button
                  onClick={handleCopyPhone}
                  className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-foreground transition-all hover:bg-muted hover:border-primary/30"
                  title="Click to copy number"
                >
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-left font-mono font-medium">
                    {contactHandle(contact)}
                  </span>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {contact.email ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-foreground">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate font-mono">{contact.email}</span>
                  </div>
                ) : null}
              </div>

              {/* Custom fields preview in view mode */}
              {customFields.some((f) => customValues[f.id]) && (
                <div className="mt-4 rounded-lg bg-muted/40 p-2.5 space-y-1.5 border border-border/60">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Custom Fields
                  </span>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {customFields
                      .filter((f) => customValues[f.id])
                      .map((f) => (
                        <div key={f.id} className="text-xs">
                          <p className="text-[10px] text-muted-foreground truncate">{f.field_name}</p>
                          <p className="font-medium text-foreground truncate">{customValues[f.id]}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Real-time Tags Management */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <TagIcon className="h-3.5 w-3.5 text-primary" />
                <span>Tags</span>
                <span className="text-[10px] text-muted-foreground">({tags.length})</span>
              </div>

              {/* + Add Tag Popover */}
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger
                  className="inline-flex items-center justify-center rounded-md font-medium h-6 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  Add Tag
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 bg-card border border-border shadow-lg" align="end">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <span className="text-xs font-semibold text-foreground">Assign Tag</span>
                      <span className="text-[10px] text-muted-foreground">Click to toggle</span>
                    </div>

                    <Input
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      placeholder="Search tags..."
                      className="h-7 text-xs"
                    />

                    {/* Available Existing Tags */}
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {availableTags.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground py-1 text-center">
                          {tagSearch ? "No matching tags" : "All tags already added"}
                        </p>
                      ) : (
                        availableTags.map((tag) => (
                          <button
                            key={tag.id}
                            onClick={() => handleAddTag(tag)}
                            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="text-foreground font-medium">{tag.name}</span>
                            </span>
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          </button>
                        ))
                      )}
                    </div>

                    {/* Create New Tag Inline */}
                    <div className="border-t border-border pt-2 space-y-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                        Create New Tag
                      </span>
                      <div className="flex gap-1.5">
                        <Input
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          placeholder="e.g. Details received"
                          className="h-7 text-xs flex-1"
                        />
                        <Button
                          size="sm"
                          className="h-7 px-2.5 bg-primary text-xs"
                          onClick={handleCreateNewTag}
                          disabled={!newTagName.trim() || creatingTag}
                        >
                          {creatingTag ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                        </Button>
                      </div>

                      {/* Color Palette */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {PRESET_TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setNewTagColor(c)}
                            type="button"
                            className={cn(
                              "h-4 w-4 rounded-full transition-transform",
                              newTagColor === c ? "ring-2 ring-primary scale-110" : "opacity-80 hover:opacity-100"
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Render Assigned Tags with Real-time Remove 'X' */}
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No tags assigned yet</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id || tag.id}
                    className="group inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-0.5 text-xs font-medium border"
                    style={{
                      backgroundColor: `${tag.color}15`,
                      borderColor: `${tag.color}40`,
                      color: tag.color,
                    }}
                  >
                    <span>{tag.name}</span>
                    <button
                      onClick={() => handleRemoveTag(tag.id, tag.name)}
                      className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                      title={`Remove tag ${tag.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Active Deals Section */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
              <span>Deals</span>
              <span className="text-[10px] text-muted-foreground">({deals.length})</span>
            </div>
            <div className="space-y-2">
              {deals.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg border border-border bg-muted/40 p-2.5 transition-colors hover:border-primary/30"
                  >
                    <p className="text-xs font-medium text-foreground">{deal.title}</p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {deal.currency ?? "₹"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notes Section */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              <StickyNote className="h-3.5 w-3.5 text-amber-500" />
              <span>Notes</span>
              <span className="text-[10px] text-muted-foreground">({notes.length})</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted/60 p-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2.5 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>

              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs"
                  >
                    <p className="whitespace-pre-wrap text-foreground">{note.note_text}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
