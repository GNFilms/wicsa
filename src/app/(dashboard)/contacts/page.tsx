'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Plus,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  X,
  Camera,
  GitBranch,
  Tag as TagIcon,
  UserPlus,
  Send,
  CheckCheck,
  Download,
  ListPlus,
  Calendar,
  ArrowUpDown,
  ChevronDown,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { AttachPhotoDialog } from '@/components/contacts/attach-photo-dialog';
import { TemplatePicker, type TemplateSendValues } from '@/components/inbox/template-picker';
import type { MessageTemplate, AccountMember } from '@/types';
import { useCan } from '@/hooks/use-can';
import { useAuth } from '@/hooks/use-auth';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
}

export default function ContactsPage() {
  const t = useTranslations('Contacts.page');
  const supabase = createClient();
  const { accountId, accountRole, user, profile } = useAuth();
  const isAdmin = accountRole === 'owner' || accountRole === 'admin';
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  // Additional filters & sorting
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [savedByFilter, setSavedByFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'az' | 'za'>('recent');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachTarget, setAttachTarget] = useState<Contact | null>(null);

  // Add to Pipeline states
  const [addToPipelineOpen, setAddToPipelineOpen] = useState(false);
  const [pipelineTargetContacts, setPipelineTargetContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<Record<string, { id: string; name: string; color: string; default_assignee_id?: string | null }[]>>({});
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [selectedStageId, setSelectedStageId] = useState('');
  const [dealTitle, setDealTitle] = useState('');
  const [dealValue, setDealValue] = useState('0');
  const [addingToPipeline, setAddingToPipeline] = useState(false);

  const fetchPipelines = useCallback(async () => {
    if (!accountId) return;
    const [pipeRes, stageRes] = await Promise.all([
      supabase.from('pipelines').select('id, name').eq('account_id', accountId),
      supabase.from('pipeline_stages').select('id, pipeline_id, name, color, default_assignee_id').eq('account_id', accountId).order('display_order'),
    ]);
    if (pipeRes.data) {
      setPipelines(pipeRes.data);
      if (pipeRes.data.length > 0) {
        setSelectedPipelineId((prev) => prev || pipeRes.data[0].id);
      }
    }
    if (stageRes.data) {
      const stageMap: Record<string, { id: string; name: string; color: string; default_assignee_id?: string | null }[]> = {};
      stageRes.data.forEach((st) => {
        if (!stageMap[st.pipeline_id]) stageMap[st.pipeline_id] = [];
        stageMap[st.pipeline_id].push(st);
      });
      setStages(stageMap);
    }
  }, [accountId, supabase]);

  const openAddToPipeline = (contact: Contact) => {
    setPipelineTargetContacts([contact]);
    setDealTitle(`${contact.name || contact.phone || 'Lead'} - Deal`);
    setDealValue('0');
    fetchPipelines();
    setAddToPipelineOpen(true);
  };

  const openBulkAddToPipeline = () => {
    const targets = contacts.filter((c) => selected.has(c.id));
    if (targets.length === 0) return;
    setPipelineTargetContacts(targets);
    setDealTitle(targets.length === 1 ? `${targets[0].name || targets[0].phone} - Deal` : `${targets.length} Contacts Deal`);
    setDealValue('0');
    fetchPipelines();
    setAddToPipelineOpen(true);
  };

  const handleConfirmAddToPipeline = async () => {
    if (!selectedPipelineId || !selectedStageId || pipelineTargetContacts.length === 0) {
      toast.error('Please select a pipeline and stage');
      return;
    }
    setAddingToPipeline(true);
    try {
      const currentStages = stages[selectedPipelineId] || [];
      const stageInfo = currentStages.find((s) => s.id === selectedStageId);
      const assignedTo = stageInfo?.default_assignee_id || profile?.id || null;
      const numValue = parseFloat(dealValue) || 0;

      const rows = pipelineTargetContacts.map((c) => ({
        title: pipelineTargetContacts.length === 1 ? dealTitle.trim() || `${c.name || c.phone} - Deal` : `${c.name || c.phone} - Deal`,
        value: numValue,
        contact_id: c.id,
        pipeline_id: selectedPipelineId,
        stage_id: selectedStageId,
        account_id: accountId,
        user_id: user?.id,
        assigned_to: assignedTo,
        status: 'open',
      }));

      const { error } = await supabase.from('deals').insert(rows);
      if (error) throw error;

      toast.success(
        pipelineTargetContacts.length === 1
          ? `Added "${pipelineTargetContacts[0].name || pipelineTargetContacts[0].phone}" to pipeline!`
          : `Added ${pipelineTargetContacts.length} contacts to pipeline!`
      );
      setAddToPipelineOpen(false);
      setSelected(new Set());
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to add to pipeline');
    } finally {
      setAddingToPipeline(false);
    }
  };

  const handlePhotoUpdated = (updated: Contact) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
  };

  // Bulk actions states
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [selectedBulkTagId, setSelectedBulkTagId] = useState('');
  const [applyingBulkTag, setApplyingBulkTag] = useState(false);

  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<AccountMember[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [assigningMembers, setAssigningMembers] = useState(false);

  const [bulkBroadcastOpen, setBulkBroadcastOpen] = useState(false);
  const [sendingBulkBroadcast, setSendingBulkBroadcast] = useState(false);

  const handleSelectAllInWorkspace = async () => {
    if (selected.size === totalCount) {
      setSelected(new Set());
      return;
    }
    try {
      const { data, error } = await supabase.from('contacts').select('id');
      if (error) throw error;
      if (data) {
        setSelected(new Set(data.map((c) => c.id)));
        toast.success(`Selected all ${data.length} contacts!`);
      }
    } catch {
      toast.error('Failed to select all contacts');
    }
  };

  const handleApplyBulkTag = async () => {
    if (!selectedBulkTagId || selected.size === 0) {
      toast.error('Please select a tag');
      return;
    }
    setApplyingBulkTag(true);
    try {
      const rows = Array.from(selected).map((cid) => ({
        contact_id: cid,
        tag_id: selectedBulkTagId,
      }));
      const { error } = await supabase.from('contact_tags').upsert(rows, { onConflict: 'contact_id,tag_id' });
      if (error) throw error;
      toast.success(`Tag applied to ${selected.size} contacts!`);
      setBulkTagOpen(false);
      setSelectedBulkTagId('');
      fetchContacts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply tag');
    } finally {
      setApplyingBulkTag(false);
    }
  };

  const openBulkAssign = async () => {
    try {
      const res = await fetch('/api/account/members');
      if (res.ok) {
        const json = await res.json();
        if (json.members) {
          setTeamMembers(json.members);
          if (json.members.length > 0) setSelectedAssigneeId(json.members[0].user_id);
        }
      }
    } catch {}
    setBulkAssignOpen(true);
  };

  const handleApplyBulkAssign = async () => {
    if (!selectedAssigneeId || selected.size === 0) {
      toast.error('Please select a team member');
      return;
    }
    setAssigningMembers(true);
    try {
      const selectedIds = Array.from(selected);
      // Update conversations where contact_id is in selected
      const { error } = await supabase
        .from('conversations')
        .update({ assigned_agent_id: selectedAssigneeId })
        .in('contact_id', selectedIds);

      if (error) throw error;

      const member = teamMembers.find((m) => m.user_id === selectedAssigneeId);
      const name = member?.full_name || member?.email || 'Team member';
      toast.success(`Assigned ${selected.size} contacts to ${name}!`);
      setBulkAssignOpen(false);
      setSelected(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign member');
    } finally {
      setAssigningMembers(false);
    }
  };

  const handleSendBulkBroadcast = async (
    template: MessageTemplate,
    values: TemplateSendValues,
  ) => {
    setSendingBulkBroadcast(true);
    const selectedList = contacts.filter((c) => selected.has(c.id));
    let sentCount = 0;
    try {
      for (const c of selectedList) {
        try {
          await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contact_id: c.id,
              message_type: 'template',
              media_url: values.headerMediaUrl || template.header_media_url || undefined,
              template_name: template.name,
              template_language: template.language,
              template_message_params: {
                body: values.body,
                headerText: values.headerText,
                headerMediaUrl: values.headerMediaUrl || template.header_media_url || undefined,
                buttonParams: values.buttonParams,
              },
              template_params: values.body,
            }),
          });
          sentCount++;
        } catch {}
      }
      toast.success(`Broadcast sent to ${sentCount} contacts!`);
      setBulkBroadcastOpen(false);
      setSelected(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send broadcast');
    } finally {
      setSendingBulkBroadcast(false);
    }
  };

  // Bulk selection (page-scoped — only the loaded rows are selectable)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let contactRows: Contact[];
    let count: number;

      if (selectedTagIds.length > 0) {
        // Tag filter active — resolve it server-side (join + distinct +
        // windowed total count + pagination) so a tag covering many
        // contacts can't silently truncate the result or overflow an IN
        // clause. See migration 025_filter_contacts_by_tags.
        const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
          p_tag_ids: selectedTagIds,
          p_search: term || null,
          p_limit: PAGE_SIZE,
          p_offset: from,
        });
        if (seq !== fetchSeq.current) return; // superseded by a newer fetch
        if (error) {
          toast.error(t('toastFailedLoad'));
          setLoading(false);
          return;
        }
        const rows = (data ?? []) as { contact: Contact; total_count: number }[];
        contactRows = rows.map((r) => r.contact);
        count = rows.length > 0 ? Number(rows[0].total_count) : 0;

        // Apply additional client-side filters & sort when tag RPC is active
        if (sectorFilter.trim()) {
          const sLow = sectorFilter.trim().toLowerCase();
          contactRows = contactRows.filter((c) => (c.company || '').toLowerCase().includes(sLow));
        }
        if (isAdmin && savedByFilter !== 'all') {
          contactRows = contactRows.filter((c) => c.user_id === savedByFilter);
        }
        if (dateFilter !== 'all') {
          const now = Date.now();
          let startMs = 0;
          let endMs = Infinity;
          if (dateFilter === 'today') {
            const d = new Date(); d.setHours(0, 0, 0, 0); startMs = d.getTime();
          } else if (dateFilter === '7days') {
            startMs = now - 7 * 86400_000;
          } else if (dateFilter === '30days') {
            startMs = now - 30 * 86400_000;
          } else if (dateFilter === 'custom') {
            if (dateFrom) startMs = new Date(dateFrom).getTime();
            if (dateTo) endMs = new Date(dateTo + 'T23:59:59').getTime();
          }
          contactRows = contactRows.filter((c) => {
            const tMs = new Date(c.updated_at || c.created_at).getTime();
            return tMs >= startMs && tMs <= endMs;
          });
        }
        contactRows.sort((a, b) => {
          if (sortBy === 'az') return (a.name || '').localeCompare(b.name || '');
          if (sortBy === 'za') return (b.name || '').localeCompare(a.name || '');
          const tA = new Date(a.updated_at || a.created_at).getTime();
          const tB = new Date(b.updated_at || b.created_at).getTime();
          return sortBy === 'oldest' ? tA - tB : tB - tA;
        });
      } else {
        const orderCol = sortBy === 'az' || sortBy === 'za' ? 'name' : 'updated_at';
        const ascending = sortBy === 'az' || sortBy === 'oldest';
        let query = supabase
          .from('contacts')
          .select('*', { count: 'exact' })
          .order(orderCol, { ascending })
          .range(from, to);

        if (term) {
          const like = `%${term}%`;
          query = query.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like},company.ilike.${like}`);
        }
        if (sectorFilter.trim()) {
          query = query.ilike('company', `%${sectorFilter.trim()}%`);
        }
        if (isAdmin && savedByFilter !== 'all') {
          query = query.eq('user_id', savedByFilter);
        }
        if (dateFilter === 'today') {
          const d = new Date(); d.setHours(0, 0, 0, 0);
          query = query.gte('updated_at', d.toISOString());
        } else if (dateFilter === '7days') {
          query = query.gte('updated_at', new Date(Date.now() - 7 * 86400_000).toISOString());
        } else if (dateFilter === '30days') {
          query = query.gte('updated_at', new Date(Date.now() - 30 * 86400_000).toISOString());
        } else if (dateFilter === 'custom') {
          if (dateFrom) query = query.gte('updated_at', new Date(dateFrom).toISOString());
          if (dateTo) query = query.lte('updated_at', new Date(dateTo + 'T23:59:59').toISOString());
        }

        const { data, count: exactCount, error } = await query;
        if (seq !== fetchSeq.current) return; // superseded by a newer fetch
        if (error) {
          toast.error(t('toastFailedLoad'));
          setLoading(false);
          return;
        }
        contactRows = data ?? [];
        count = exactCount ?? 0;
      }

    setTotalCount(count);

    if (contactRows.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch tags for these contacts
    const contactIds = contactRows.map((c) => c.id);
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('contact_id', contactIds);
    if (seq !== fetchSeq.current) return; // superseded by a newer fetch

    const tagsByContact: Record<string, string[]> = {};
    contactTags?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const enriched: ContactWithTags[] = contactRows.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
    }));

    setContacts(enriched);
    setLoading(false);
  }, [supabase, page, search, selectedTagIds, tagsMap, t, dateFilter, dateFrom, dateTo, sectorFilter, savedByFilter, sortBy, isAdmin]);

  // Load team members for Admin "Saved by Team Member" filter
  useEffect(() => {
    if (!isAdmin || teamMembers.length > 0) return;
    fetch('/api/account/members')
      .then((r) => r.json())
      .then((json) => {
        if (json?.members) setTeamMembers(json.members);
      })
      .catch(() => {});
  }, [isAdmin, teamMembers.length]);

  const handleExportSelectedCsv = () => {
    const rows = contacts.filter((c) => selected.has(c.id));
    if (rows.length === 0) return;
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Phone', 'Email', 'Company/Sector', 'Tags', 'Modified'].join(',');
    const body = rows.map((c) =>
      [
        esc(c.name || ''),
        esc(c.phone || ''),
        esc(c.email || ''),
        esc(c.company || ''),
        esc((c.tags || []).map((tg) => tg.name).join('; ')),
        esc(new Date(c.updated_at || c.created_at).toLocaleString()),
      ].join(','),
    );
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_selected_${rows.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} contacts to CSV!`);
  };

  const handleCreateListFromSelected = async () => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0 || !accountId) return;
    const listName = window.prompt('Enter a name for this Contact List (saved as a reusable tag/group):');
    if (!listName || !listName.trim()) return;
    const trimmed = listName.trim();
    try {
      const { data: newTag, error: tagErr } = await supabase
        .from('tags')
        .insert({
          name: trimmed,
          color: '#7c3aed',
          account_id: accountId,
          user_id: user?.id,
        })
        .select()
        .single();
      if (tagErr) throw tagErr;
      const rows = selectedIds.map((contact_id) => ({ contact_id, tag_id: newTag.id }));
      const { error: linkErr } = await supabase
        .from('contact_tags')
        .upsert(rows, { onConflict: 'contact_id,tag_id' });
      if (linkErr) throw linkErr;
      toast.success(`List "${trimmed}" created with ${selectedIds.length} contacts!`);
      await fetchTags();
      await fetchContacts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list');
    }
  };

  // Load-once-on-mount-ish data fetches. Each setter inside runs
  // inside an async promise completion (Supabase await), not
  // synchronously in the effect body, so the cascade the lint rule
  // warns about doesn't apply here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    const { error } = await supabase.from('contacts').delete().in('id', ids);

    if (error) {
      toast.error(t('toastBulkFailedDelete'));
    } else {
      toast.success(t('toastBulkDeleted', { count: ids.length }));
      setSelected(new Set());
      fetchContacts();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters = search.trim().length > 0 || selectedTagIds.length > 0;

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount > 0 ? t('subtitle', { count: totalCount }) : t('subtitleZero')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEditSettings && (
            <Button
              variant="outline"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="size-4" />
              {t('customFieldsBtn')}
            </Button>
          )}
          <GatedButton
            variant="outline"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={() => setImportOpen(true)}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <Upload className="size-4" />
            {t('importBtn')}
          </GatedButton>
          <GatedButton
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            {t('addContactBtn')}
          </GatedButton>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Reset pagination when the query changes — the result
                // set shrinks/grows, page N may no longer be valid.
                setPage(0);
              }}
              placeholder={t('searchPlaceholder')}
              className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted shrink-0"
                />
              }
            >
              <Filter className="size-4" />
              {t('filterByTags')}
              {selectedTagIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium text-popover-foreground">
                  {t('filterByTags')}
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('clearAll')}
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {t('noTagsYet')}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={`Filter by ${tag.name}`}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-popover-foreground truncate">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Filter by Sector / Company */}
          <Input
            value={sectorFilter}
            onChange={(e) => {
              setSectorFilter(e.target.value);
              setPage(0);
            }}
            placeholder="Filter by sector / company..."
            className="w-full sm:w-44 bg-card border-border text-foreground placeholder:text-muted-foreground"
          />

          {/* Filter by Date */}
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value as typeof dateFilter);
              setPage(0);
            }}
            className="h-9 rounded-md border border-border bg-card px-2.5 text-xs text-foreground outline-none"
            title="Filter by Date"
          >
            <option value="all">Date: All Time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="custom">Custom Range...</option>
          </select>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                title="From Date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                className="h-9 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                title="To Date"
              />
            </div>
          )}

          {/* Filter by Team Member (Admin only) */}
          {isAdmin && (
            <select
              value={savedByFilter}
              onChange={(e) => {
                setSavedByFilter(e.target.value);
                setPage(0);
              }}
              className="h-9 rounded-md border border-border bg-card px-2.5 text-xs text-foreground outline-none"
              title="Filter by Team Member who saved the contact"
            >
              <option value="all">Saved by: All Members</option>
              {teamMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as typeof sortBy);
              setPage(0);
            }}
            className="h-9 rounded-md border border-border bg-card px-2.5 text-xs text-foreground outline-none"
            title="Sort Contacts"
          >
            <option value="recent">Sort: Recent - Oldest</option>
            <option value="oldest">Sort: Oldest - Recent</option>
            <option value="az">Sort: Name (A - Z)</option>
            <option value="za">Sort: Name (Z - A)</option>
          </select>
        </div>

        {/* Active tag-filter chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={`Remove ${tag.name} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearTagFilters}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-5 items-center justify-center rounded-full bg-primary/20 px-2 text-xs font-bold text-primary">
              {selected.size}
            </span>
            <span className="text-xs font-medium text-foreground">
              {t('selectedCount', { count: selected.size })}
            </span>
            {selected.size < totalCount && (
              <button
                type="button"
                onClick={handleSelectAllInWorkspace}
                className="text-xs text-primary underline hover:text-primary/80 ml-1 font-semibold"
              >
                Select all {totalCount} contacts
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Actions Dropdown for Selected Contacts */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-xs h-8"
                  />
                }
              >
                <span>Actions ({selected.size})</span>
                <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setBulkBroadcastOpen(true)}>
                  <Send className="size-3.5 mr-2 text-primary" />
                  Broadcast
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkBroadcastOpen(true)}>
                  <Send className="size-3.5 mr-2 text-amber-500" />
                  Send Template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBulkTagOpen(true)}>
                  <TagIcon className="size-3.5 mr-2 text-primary" />
                  Label / Tag
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCreateListFromSelected}>
                  <ListPlus className="size-3.5 mr-2 text-emerald-500" />
                  Create List
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSelectedCsv}>
                  <Download className="size-3.5 mr-2 text-blue-500" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openBulkAssign}>
                  <UserPlus className="size-3.5 mr-2" />
                  Assign Member
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openBulkAddToPipeline()}>
                  <GitBranch className="size-3.5 mr-2" />
                  Add to Pipeline
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5 mr-2" />
                  {t('deleteSelected')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* 1. Label / Tag */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkTagOpen(true)}
              className="border-border text-foreground hover:bg-muted gap-1 text-xs h-8"
              title="Add tag to selected contacts"
            >
              <TagIcon className="size-3.5 text-primary" />
              <span>Label / Tag</span>
            </Button>

            {/* 2. Assign Member */}
            <Button
              variant="outline"
              size="sm"
              onClick={openBulkAssign}
              className="border-border text-foreground hover:bg-muted gap-1 text-xs h-8"
              title="Assign team member"
            >
              <UserPlus className="size-3.5 text-primary" />
              <span>Assign</span>
            </Button>

            {/* 3. Add to Pipeline */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => openBulkAddToPipeline()}
              className="border-border text-foreground hover:bg-muted gap-1 text-xs h-8"
              title="Push to pipeline stage"
            >
              <GitBranch className="size-3.5 text-primary" />
              <span>Pipeline</span>
            </Button>

            {/* 4. Send Broadcast */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkBroadcastOpen(true)}
              className="border-border text-foreground hover:bg-muted gap-1 text-xs h-8"
              title="Send template broadcast"
            >
              <Send className="size-3.5 text-primary" />
              <span>Broadcast</span>
            </Button>

            {/* 5. Delete Selected */}
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={() => setBulkDeleteOpen(true)}
              className="gap-1 text-xs h-8"
            >
              <Trash2 className="size-3.5" />
              <span>{t('deleteSelected')}</span>
            </GatedButton>

            {/* Clear Selection */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground text-xs h-8"
            >
              {t('clearSelection')}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-11 min-w-[44px] px-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                  }}
                  onChange={toggleSelectAll}
                  disabled={contacts.length === 0}
                  aria-label={t('selectAllOnPage')}
                  className="h-4 w-4 shrink-0 cursor-pointer rounded border-2 border-muted-foreground/60 accent-primary align-middle"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.name')}</TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.phone')}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t('tableColumns.email')}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t('tableColumns.company')}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t('tableColumns.tags')}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Modified (Date &amp; Time)</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('loading')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? t('noContactsMatch')
                        : t('noContactsYet')}
                    </p>
                    {!hasActiveFilters && (
                      <GatedButton
                        canAct={canEdit}
                        gateReason="add or import contacts"
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-3.5" />
                        {t('addFirstContact')}
                      </GatedButton>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className={`border-border hover:bg-muted/50 cursor-pointer ${
                    selected.has(contact.id) ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => openDetail(contact.id)}
                >
                  <TableCell className="w-11 min-w-[44px] px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      aria-label={`Select ${contact.name || contact.phone}`}
                      className="h-4 w-4 shrink-0 cursor-pointer rounded border-2 border-muted-foreground/60 accent-primary align-middle"
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="relative group size-8 shrink-0 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border cursor-pointer shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAttachTarget(contact);
                          setAttachOpen(true);
                        }}
                        title="Click to attach or change photo"
                      >
                        {contact.avatar_url ? (
                          <img
                            src={contact.avatar_url}
                            alt={contact.name || ""}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-primary">
                            {(contact.name || contact.phone || "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Camera className="size-3.5" />
                        </div>
                      </div>
                      <span className="truncate">
                        {contact.name || <span className="text-muted-foreground italic">{t('unnamed')}</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {contact.phone}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                    {contact.email || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                    {contact.company || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden lg:table-cell whitespace-nowrap">
                    {new Date(contact.updated_at || contact.created_at).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setAttachTarget(contact);
                            setAttachOpen(true);
                          }}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Camera className="size-4" />
                          Attach Photo
                        </DropdownMenuItem>
                        {isAdmin && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openAddToPipeline(contact);
                            }}
                            className="text-popover-foreground focus:bg-muted focus:text-foreground"
                          >
                            <GitBranch className="size-4 text-primary" />
                            Add to Pipeline
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(contact);
                          }}
                          className="text-popover-foreground focus:bg-muted focus:text-foreground"
                        >
                          <Pencil className="size-4" />
                          {t('editAction')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(contact);
                          }}
                        >
                          <Trash2 className="size-4" />
                          {t('deleteAction')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {t('pageCount', { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={fetchContacts}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('deleteContactTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteContactDesc', { name: deleteTarget?.name || deleteTarget?.phone || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              {t('deleteBulkTitle')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteBulkDesc', { count: selected.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Attach Photo Modal */}
      <AttachPhotoDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        contact={attachTarget}
        onPhotoUpdated={handlePhotoUpdated}
      />

      {/* Add to Pipeline Dialog for Admin */}
      <Dialog open={addToPipelineOpen} onOpenChange={setAddToPipelineOpen}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <GitBranch className="size-4 text-primary" />
              Add to Active Pipeline
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {pipelineTargetContacts.length === 1
                ? `Assign "${pipelineTargetContacts[0].name || pipelineTargetContacts[0].phone}" to a sales or service pipeline.`
                : `Assign ${pipelineTargetContacts.length} selected contacts to a pipeline.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Pipeline Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Select Pipeline</Label>
              {pipelines.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No pipelines found. Please create one in Pipelines first.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  <select
                    value={selectedPipelineId}
                    onChange={(e) => {
                      setSelectedPipelineId(e.target.value);
                      const currentStages = stages[e.target.value] || [];
                      if (currentStages.length > 0) {
                        setSelectedStageId(currentStages[0].id);
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground shadow-xs focus:border-primary focus:outline-none"
                  >
                    <option value="" disabled>Choose a pipeline...</option>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Stage Selector */}
            {selectedPipelineId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Pipeline Stage</Label>
                {(!stages[selectedPipelineId] || stages[selectedPipelineId].length === 0) ? (
                  <p className="text-xs text-muted-foreground italic">No stages defined for this pipeline.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {stages[selectedPipelineId].map((st) => {
                      const isSel = selectedStageId === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setSelectedStageId(st.id)}
                          className={`flex items-center gap-1.5 rounded-lg border p-2 text-xs text-left transition-all cursor-pointer ${
                            isSel
                              ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40"
                              : "border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: st.color || "#8b5cf6" }}
                          />
                          <span className="truncate">{st.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Deal Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Deal Title</Label>
              <Input
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
                placeholder="e.g. Nayak Computer - New Order"
                className="h-8 text-xs bg-background"
              />
            </div>

            {/* Deal Value */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Deal Value (₹ / Amount)</Label>
              <Input
                type="number"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0"
                className="h-8 text-xs bg-background font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddToPipelineOpen(false)}
              disabled={addingToPipeline}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAddToPipeline}
              disabled={addingToPipeline || !selectedPipelineId || !selectedStageId}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {addingToPipeline && <Loader2 className="size-3.5 animate-spin" />}
              Confirm & Add to Pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <TagIcon className="size-4 text-primary" />
              Apply Tag to {selected.size} Contacts
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Choose an existing label/tag to categorize all selected contacts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Select Label / Tag</Label>
              <div className="flex flex-wrap gap-2 pt-1 max-h-48 overflow-y-auto">
                {Object.values(tagsMap).map((tag) => {
                  const isSel = selectedBulkTagId === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setSelectedBulkTagId(tag.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                        isSel
                          ? "ring-2 ring-primary ring-offset-1 ring-offset-background font-semibold"
                          : "opacity-80 hover:opacity-100"
                      }`}
                      style={{
                        backgroundColor: `${tag.color}25`,
                        color: tag.color,
                      }}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setBulkTagOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApplyBulkTag}
              disabled={applyingBulkTag || !selectedBulkTagId}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {applyingBulkTag && <Loader2 className="size-3.5 animate-spin" />}
              Apply Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Member Dialog */}
      <Dialog open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
        <DialogContent className="sm:max-w-md bg-card text-card-foreground border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <UserPlus className="size-4 text-primary" />
              Assign {selected.size} Contacts to Team Member
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select an agent to handle conversations for these contacts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Select Agent / Team Member</Label>
              {teamMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No team members found.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {teamMembers.map((member) => {
                    const isSel = selectedAssigneeId === member.user_id;
                    return (
                      <button
                        key={member.user_id}
                        type="button"
                        onClick={() => setSelectedAssigneeId(member.user_id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
                          isSel
                            ? "border-primary bg-primary/10 font-semibold"
                            : "border-border/70 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
                            {(member.full_name || member.email || "U").charAt(0).toUpperCase()}
                          </span>
                          <div className="text-left">
                            <p className="text-foreground font-medium">{member.full_name || member.email}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>
                          </div>
                        </div>
                        {isSel && <CheckCheck className="size-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setBulkAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApplyBulkAssign}
              disabled={assigningMembers || !selectedAssigneeId}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            >
              {assigningMembers && <Loader2 className="size-3.5 animate-spin" />}
              Assign Contacts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Broadcast Template Picker */}
      <TemplatePicker
        open={bulkBroadcastOpen}
        onOpenChange={setBulkBroadcastOpen}
        onSelect={handleSendBulkBroadcast}
      />
    </div>
  );
}
