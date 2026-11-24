"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from "@/lib/inbox/conversations";
import type { Conversation, Message, Contact, ConversationStatus, Task } from "@/types";
import { useRealtime } from "@/hooks/use-realtime";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactSidebar } from "@/components/inbox/contact-sidebar";
import { Button } from "@/components/ui/button";
import { CreateReminderDialog } from "@/components/reminders/create-reminder-dialog";
import { ReminderCalendarModal } from "@/components/reminders/reminder-calendar-modal";
import { toast } from "sonner";
import { WifiOff, Calendar as CalendarIcon, Clock, Plus, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

// Remembers the agent's show/hide choice for the desktop contact panel
// across reloads and sessions (device-scoped, like the theme prefs).
const CONTACT_PANEL_STORAGE_KEY = "wacrm:inbox:contact-panel-open";

// `useSearchParams` (the `?c=<id>` deep link below) requires a Suspense
// boundary or the production build bails to CSR and errors out. Thin
// wrapper supplies it; the inner component holds all the inbox state.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

function InboxPageInner() {
  const t = useTranslations("Inbox.page");
  const router = useRouter();
  const searchParams = useSearchParams();
  /**
   * `?c=<id>` deep-link support. Used when landing here from the
   * dashboard's recent-conversations list so the right thread opens
   * automatically instead of showing the empty center panel.
   */
  const deepLinkConvId = searchParams.get("c");
  const deepLinkContactId = searchParams.get("contactId");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const activeConversationRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null
  );
  /**
   * Bumped whenever we want children (ConversationList, MessageThread)
   * to refetch from the DB — used as a safety net against missed
   * realtime events. Bumped on WS reconnect and on tab visibility →
   * visible. The initial mount fetches don't depend on this; they fire
   * once on conversationId-change as usual.
   */
  const [resyncToken, setResyncToken] = useState(0);

  /**
   * Whether the desktop contact sidebar (tags / deals / notes) is shown.
   * Defaults to `true` (the historical behaviour) and is restored from
   * localStorage after mount. We deliberately do NOT read localStorage in
   * the initializer: the server renders with `true`, so reading a stored
   * `false` synchronously would produce a hydration mismatch. The effect
   * below reconciles to the stored value right after mount instead.
   */
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTACT_PANEL_STORAGE_KEY);
      if (stored !== null) setContactPanelOpen(stored === "true");
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
  }, []);

  const handleToggleContactPanel = useCallback(() => {
    setContactPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  // Top Bar Reminders & Tasks state
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [createReminderOpen, setCreateReminderOpen] = useState(false);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<"all" | "30min" | "3hours" | "today">("all");

  const fetchUpcomingTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?limit=20", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.tasks) {
          setUpcomingTasks(json.tasks.filter((t: Task) => t.status !== "completed"));
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchUpcomingTasks();
  }, [fetchUpcomingTasks, resyncToken]);

  // Tracks whether the initial deep-link (?c=<id> or ?contactId=<id>) has
  // already been resolved and selected on page load. Once true, subsequent
  // list refreshes or user clicks will NEVER snap the user back to the old
  // deep-linked conversation.
  const initialDeepLinkHandledRef = useRef<boolean>(false);

  // Tracks conversations whose hydrate fetch is currently in flight. The
  // conv-INSERT and the first-message-INSERT events both call into
  // hydrateConversation; the dedupe here keeps it at one refetch per
  // new conversation even when both events arrive within milliseconds.
  const hydratingConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * Synchronous mirror of the conversation ids currently in `conversations`
   * state. Event handlers need to know "do we already have this conv?"
   * without waiting for a setState updater to run — updaters fire during
   * reconciliation, *after* the synchronous handler code returns, so a
   * `let foundInList = false; setState(p => { foundInList = ...; return ... })`
   * flag reads as `false` in the same tick (this exact bug shipped in #105
   * and caused #106: every incoming message and every status flip fired a
   * redundant DB hydrate, swamping the supabase client and starving the
   * realtime channel). The ref is kept in sync via the effect below.
   */
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const c of conversations) next.add(c.id);
    knownConvIdsRef.current = next;
  }, [conversations]);

  // Pull the conversation row with its `contact` joined and merge it
  // into state. Needed because Supabase Realtime payloads only carry the
  // row's own columns — a brand-new conversation arrives without a
  // contact, which surfaced as "Unknown" names, empty avatars, and
  // (when the conv-INSERT event was delayed past the message-INSERT)
  // conversations stuck on "No messages yet" until the user reloaded.
  // Also self-heals if a realtime event was missed: callers can invoke
  // this whenever they reference a conversation id they don't recognise.
  const hydrateConversation = useCallback(async (convId: string) => {
    if (hydratingConvIdsRef.current.has(convId)) return;
    hydratingConvIdsRef.current.add(convId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .eq("id", convId)
        .maybeSingle();
      if (error) {
        // Supabase errors have non-enumerable properties — log fields
        // explicitly so the console message isn't just `{}`.
        console.error("Failed to hydrate conversation:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }
      if (!data) return;
      const fetched = normalizeConversation(data);
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === fetched.id);
        if (existing) {
          // Already in state — keep its fields (a realtime UPDATE may
          // have landed while the fetch was in flight and patched
          // last_message_text / unread_count to fresher values than
          // the row we just read). Only backfill `contact`, which the
          // realtime payloads never carry.
          return prev.map((c) =>
            c.id === fetched.id
              ? { ...c, contact: c.contact ?? fetched.contact }
              : c,
          );
        }
        return [fetched, ...prev];
      });
    } finally {
      hydratingConvIdsRef.current.delete(convId);
    }
  }, []);

  // Check WhatsApp connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) return;

      // whatsapp_config is one-row-per-account post-multi-user, so
      // the previous `.eq('user_id', user.id)` would miss the row
      // for any teammate who didn't personally save the config —
      // the "WhatsApp not connected" banner would show in the
      // shared inbox even though the admin had it configured.
      // Resolve account_id via the profile and query by that.
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const accountId = profile?.account_id as string | undefined;
      if (!accountId) {
        setWhatsappConnected(false);
        return;
      }

      const { data } = await supabase
        .from("whatsapp_config")
        .select("status")
        .eq("account_id", accountId)
        .maybeSingle();

      setWhatsappConnected(data?.status === "connected");
    };

    checkConnection();
  }, []);

  // Handle realtime message events
  const handleMessageEvent = useCallback(
    (event: { eventType: string; new: Message; old: Partial<Message> }) => {
      const newMsg = event.new;

      if (event.eventType === "INSERT") {
        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic message if it exists
            const withoutOptimistic = prev.filter(
              (m) => !m.id.startsWith("temp-")
            );
            return [...withoutOptimistic, newMsg];
          });
        }

        // Update conversation list preview. We need to know *synchronously*
        // whether the conv is already in state to decide between patching
        // the preview and triggering a hydrate — see the comment on
        // knownConvIdsRef for why a closure flag inside the updater would
        // always read false here.
        if (knownConvIdsRef.current.has(newMsg.conversation_id)) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? {
                    ...c,
                    last_message_text: newMsg.content_text ?? "",
                    last_message_at: newMsg.created_at,
                    unread_count:
                      activeConversation?.id === newMsg.conversation_id
                        ? 0
                        : c.unread_count + 1,
                  }
                : c,
            ),
          );
        } else {
          // First time we're seeing this conv: the conv-INSERT event
          // hasn't landed yet, or was missed. Hydrate from the DB so
          // the row surfaces with its `contact` joined; the conv-UPDATE
          // event the webhook emits right after the message INSERT will
          // converge state when it arrives.
          hydrateConversation(newMsg.conversation_id);
        }
      }

      if (event.eventType === "UPDATE") {
        // Update message status
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Handle realtime conversation events
  const handleConversationEvent = useCallback(
    (event: {
      eventType: string;
      new: Conversation;
      old: Partial<Conversation>;
    }) => {
      const conv = event.new;

      if (event.eventType === "INSERT") {
        // Prepend immediately for snappy UX so the new conv shows in the
        // list right away, then hydrate to fill in the `contact` join
        // (realtime payloads never include joins). Skip both if we
        // already have the row — that shouldn't happen normally, but
        // out-of-order delivery would have us prepending a duplicate.
        if (!knownConvIdsRef.current.has(conv.id)) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
          hydrateConversation(conv.id);
        }
      }

      if (event.eventType === "UPDATE") {
        if (knownConvIdsRef.current.has(conv.id)) {
          // If this UPDATE is for the conv the user is currently viewing,
          // suppress the incoming unread_count — the user is reading it
          // RIGHT NOW, so any positive value would just flicker the badge
          // back on for the ~100ms it takes for the reset effect's server
          // UPDATE to round-trip. Non-active convs take the value as-is.
          const isActive = activeConversation?.id === conv.id;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id
                ? {
                    ...c,
                    ...conv,
                    unread_count: isActive ? 0 : conv.unread_count,
                  }
                : c,
            ),
          );
        } else {
          // UPDATE arrived before the INSERT (or after a missed INSERT)
          // — fetch the row so it surfaces with its contact joined. The
          // patch contained in `conv` will already be reflected in what
          // the hydrate fetch returns.
          hydrateConversation(conv.id);
        }

        // Update active conversation if it changed
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) =>
            prev ? { ...prev, ...conv } : prev
          );
        }
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Subscribe to realtime. The `isConnected` flag below feeds the
  // reconnect resync: realtime is best-effort and events sent while the
  // WS was disconnected (laptop sleep, network blip, background-tab
  // throttle) are simply lost. We need a way to catch up.
  const { isConnected } = useRealtime({
    channelName: "inbox-realtime",
    onMessageEvent: handleMessageEvent,
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  /**
   * Bump `resyncToken` whenever the realtime channel transitions from
   * disconnected → connected *after* the initial connect. The initial
   * connect is covered by the children's on-mount fetches; only later
   * reconnects need a manual refetch to fill the gap.
   *
   * Tracked via a `was-connected` ref rather than a count so that React
   * strict-mode's dev-only effect double-fire doesn't read as a
   * reconnect.
   */
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // false → true transition
      if (initialConnectDoneRef.current) {
        setResyncToken((n) => n + 1);
      } else {
        initialConnectDoneRef.current = true;
      }
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Refetch when the tab regains focus. Background tabs may have their
   * WS throttled by the browser even without a full disconnect, so a
   * visibilitychange → visible is a reliable signal that we may have
   * missed events. Cheap to fire; the children dedupe on their own.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setResyncToken((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /**
   * Manual refresh trigger for the thread-header refresh button.
   * Bumps the same resyncToken the reconnect / visibility paths use,
   * so it goes through the existing dedupe & refetch plumbing — no
   * separate code path to keep in sync.
   */
  const handleManualRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);
      // Resolve an initial deep-link (?c=<id> or ?contactId=<id>) ONLY once on initial mount.
      // Once handled or if the user clicks any chat, it NEVER overrides the active thread.
      if (!initialDeepLinkHandledRef.current && loaded.length > 0) {
        if (deepLinkConvId) {
          initialDeepLinkHandledRef.current = true;
          const match = loaded.find((c) => c.id === deepLinkConvId);
          if (match && activeConversationRef.current?.id !== deepLinkConvId) {
            activeConversationRef.current = match;
            setActiveConversation(match);
            setActiveContact(match.contact ?? null);
            setMessages([]);
            if (match.unread_count > 0) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === match.id ? { ...c, unread_count: 0 } : c,
                ),
              );
            }
          }
        } else if (deepLinkContactId) {
          initialDeepLinkHandledRef.current = true;
          const match = loaded.find((c) => c.contact_id === deepLinkContactId);
          if (match && activeConversationRef.current?.id !== match.id) {
            activeConversationRef.current = match;
            setActiveConversation(match);
            setActiveContact(match.contact ?? null);
            setMessages([]);
          } else {
            // Query DB for conversation with this contact_id
            (async () => {
              const supabase = createClient();
              const { data } = await supabase
                .from("conversations")
                .select(CONVERSATION_SELECT)
                .eq("contact_id", deepLinkContactId)
                .limit(1);
              if (data && data.length > 0) {
                const norm = normalizeConversation(data[0]);
                setConversations((prev) => [norm, ...prev]);
                activeConversationRef.current = norm;
                setActiveConversation(norm);
                setActiveContact(norm.contact ?? null);
                setMessages([]);
              }
            })().catch(console.error);
          }
        }
      }
    },
    [deepLinkConvId, deepLinkContactId]
  );

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      // Re-clicking the already-active conversation would clear the
      // messages array, but the fetch effect in MessageThread only re-runs
      // when conversationId changes — so messages would stay empty until
      // the user navigated away and back. Bail out early instead.
      if (activeConversationRef.current?.id === conv.id) return;
      initialDeepLinkHandledRef.current = true;
      activeConversationRef.current = conv;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setMessages([]);
      // Optimistically clear the unread badge for this conv.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id && c.unread_count > 0
            ? { ...c, unread_count: 0 }
            : c,
        ),
      );
      // Update browser URL without triggering Next.js routing loops
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("c", conv.id);
        url.searchParams.delete("contactId");
        window.history.replaceState(null, "", url.toString());
      }
    },
    []
  );

  const handleOpenTaskChat = useCallback(
    async (task: Task) => {
      // 1. If task has conversation_id, find in current list or deep link
      if (task.conversation_id) {
        const found = conversations.find((c) => c.id === task.conversation_id);
        if (found) {
          handleSelectConversation(found);
          return;
        }
      }

      // 2. If task has contact_id or contact phone, find matching conversation
      const targetContactId = task.contact_id || task.contact?.id;
      const targetPhone = task.contact?.phone;

      if (targetContactId || targetPhone) {
        const found = conversations.find(
          (c) =>
            (targetContactId && c.contact_id === targetContactId) ||
            (targetPhone && c.contact?.phone === targetPhone)
        );
        if (found) {
          handleSelectConversation(found);
          return;
        }

        // 3. Query database for a conversation with this contact or conversation_id
        try {
          const supabase = createClient();
          if (task.conversation_id) {
            const { data } = await supabase
              .from("conversations")
              .select(CONVERSATION_SELECT)
              .eq("id", task.conversation_id)
              .maybeSingle();
            if (data) {
              const normalized = normalizeConversation(data);
              setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
              handleSelectConversation(normalized);
              return;
            }
          }

          if (targetContactId) {
            const { data } = await supabase
              .from("conversations")
              .select(CONVERSATION_SELECT)
              .eq("contact_id", targetContactId)
              .order("last_message_at", { ascending: false })
              .limit(1);
            if (data && data.length > 0) {
              const normalized = normalizeConversation(data[0]);
              setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
              handleSelectConversation(normalized);
              return;
            }
          }
        } catch (e) {
          console.error("Open task chat error:", e);
        }
      }

      if (task.conversation_id) {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("id", task.conversation_id)
            .maybeSingle();
          if (data) {
            const normalized = normalizeConversation(data);
            setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
            handleSelectConversation(normalized);
            return;
          }
        } catch (e) {
          console.error("Open task chat error:", e);
        }
      }

      toast.info(`Reminder: "${task.title}". No active chat linked yet.`);
    },
    [conversations, handleSelectConversation, router]
  );

  // Reactive listener for deep links and quick-bar / calendar clicks
  useEffect(() => {
    const handleOpenChatEvent = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        conversationId?: string | null;
        contactId?: string | null;
        phone?: string | null;
        task?: Task | null;
      }>;
      const { conversationId, contactId, phone, task } = customEvent.detail || {};

      if (task) {
        await handleOpenTaskChat(task);
        return;
      }

      // Direct match in existing conversations
      if (conversationId) {
        const match = conversations.find((c) => c.id === conversationId);
        if (match) {
          handleSelectConversation(match);
          return;
        }
      }

      if (contactId || phone) {
        const match = conversations.find(
          (c) =>
            (contactId && c.contact_id === contactId) ||
            (phone && c.contact?.phone === phone)
        );
        if (match) {
          handleSelectConversation(match);
          return;
        }
      }

      // Query database if not in current loaded conversations
      try {
        const supabase = createClient();
        if (conversationId) {
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("id", conversationId)
            .maybeSingle();
          if (data) {
            const normalized = normalizeConversation(data);
            setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
            handleSelectConversation(normalized);
            return;
          }
        }
        if (contactId) {
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("contact_id", contactId)
            .order("last_message_at", { ascending: false })
            .limit(1);
          if (data && data.length > 0) {
            const normalized = normalizeConversation(data[0]);
            setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
            handleSelectConversation(normalized);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to open chat from event:", err);
      }
    };

    window.addEventListener("wacrm:open-chat", handleOpenChatEvent);
    return () => {
      window.removeEventListener("wacrm:open-chat", handleOpenChatEvent);
    };
  }, [conversations, handleSelectConversation, handleOpenTaskChat]);

  // Reactive URL change listener (handles navigation to /inbox?c=... or /inbox?contactId=...)
  useEffect(() => {
    if (!deepLinkConvId && !deepLinkContactId) return;

    if (deepLinkConvId) {
      if (autoSelectedForDeepLinkRef.current === deepLinkConvId) return;
      autoSelectedForDeepLinkRef.current = deepLinkConvId;

      const match = conversations.find((c) => c.id === deepLinkConvId);
      if (match) {
        handleSelectConversation(match);
        return;
      }
      // Query DB for conversationId
      (async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("id", deepLinkConvId)
            .maybeSingle();
          if (data) {
            const normalized = normalizeConversation(data);
            setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
            handleSelectConversation(normalized);
          }
        } catch (e) {
          console.error("Failed to deep link conversation:", e);
        }
      })();
    } else if (deepLinkContactId) {
      const contactKey = `contact-${deepLinkContactId}`;
      if (autoSelectedForDeepLinkRef.current === contactKey) return;
      autoSelectedForDeepLinkRef.current = contactKey;

      const match = conversations.find((c) => c.contact_id === deepLinkContactId);
      if (match) {
        handleSelectConversation(match);
        return;
      }
      // Query DB for contactId
      (async () => {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("contact_id", deepLinkContactId)
            .order("last_message_at", { ascending: false })
            .limit(1);
          if (data && data.length > 0) {
            const normalized = normalizeConversation(data[0]);
            setConversations((prev) => [normalized, ...prev.filter((c) => c.id !== normalized.id)]);
            handleSelectConversation(normalized);
          }
        } catch (e) {
          console.error("Failed to deep link contact:", e);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkConvId, deepLinkContactId]);

  // Mobile "back" — deselect the conversation so the list pane comes back.
  const handleCloseConversation = useCallback(() => {
    activeConversationRef.current = null;
    setActiveConversation(null);
    setActiveContact(null);
    setMessages([]);
    autoSelectedForDeepLinkRef.current = null;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("c");
      url.searchParams.delete("contactId");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const cId = params.get("c");
      if (cId) {
        const found = conversations.find((c) => c.id === cId);
        if (found) {
          handleSelectConversation(found);
        }
      } else {
        handleCloseConversation();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [conversations, handleSelectConversation, handleCloseConversation]);


  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages(loaded);
  }, []);

  const handleNewMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  const handleContactUpdated = useCallback((updated: Contact) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.contact_id === updated.id
          ? { ...c, contact: { ...c.contact, ...updated } }
          : c
      )
    );
    setActiveConversation((prev) =>
      prev && prev.contact_id === updated.id
        ? { ...prev, contact: { ...prev.contact, ...updated } }
        : prev
    );
  }, []);

  // On mobile (<lg) we show a SINGLE pane — either the list or the
  // thread — rather than cramming both side-by-side. Selecting a
  // conversation slides the thread in; the thread's back button pops
  // it back to the list. On lg+ both panes render side-by-side as
  // before, unchanged.
  const hasActiveConv = !!activeConversation;

  // 3-way sortings for reminders in the top empty bar
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTodayTime = endOfToday.getTime();

  const next30MinTasks = upcomingTasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).getTime();
    return due <= now + 30 * 60 * 1000;
  });

  const next3HoursTasks = upcomingTasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).getTime();
    return due <= now + 3 * 60 * 60 * 1000;
  });

  const todayTasks = upcomingTasks.filter((t) => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).getTime();
    return due <= endOfTodayTime;
  });

  const activeFilteredTasks =
    taskFilter === "30min"
      ? next30MinTasks
      : taskFilter === "3hours"
      ? next3HoursTasks
      : taskFilter === "today"
      ? todayTasks
      : upcomingTasks;

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden sm:-m-6">
      {/* WhatsApp connection banner — in the flex column, not absolute,
          so it pushes the panels down instead of overlapping them. */}
      {whatsappConnected === false && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <WifiOff className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-400">
            {t("whatsappNotConnected")}
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Conversation list.
            Hidden on mobile when a conversation is selected so the
            thread can occupy the full width. Always visible on lg+. */}
        <div
          className={cn(
            "flex h-full flex-1 lg:flex-none",
            hasActiveConv ? "hidden lg:flex" : "flex",
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            resyncToken={resyncToken}
          />
        </div>

        {/* Center panel: Message thread.
            Hidden on mobile when no conversation is selected so the
            list can occupy the full width. Always visible on lg+
            (shows its own empty-state if no thread is picked yet).

            `min-w-0` is load-bearing: without it, a single wide piece
            of content inside the thread (long quote preview, very
            long URL in a message body) forces the flex child past
            its share and pushes the contact-sidebar panel off-screen
            on the right. Issue #165. */}
        <div
          className={cn(
            "flex h-full min-w-0 flex-1 lg:flex",
            hasActiveConv ? "flex" : "hidden lg:flex",
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={activeContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
            resyncToken={resyncToken}
            onRefresh={handleManualRefresh}
            contactPanelOpen={contactPanelOpen}
            onToggleContactPanel={handleToggleContactPanel}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only, and only when the
            agent hasn't collapsed it via the thread-header toggle (#258).
            On mobile it's always hidden (the `lg:block` below), so the
            toggle — which is itself desktop-only — never affects it. */}
        {contactPanelOpen && (
          <div className="hidden lg:block">
            <ContactSidebar contact={activeContact} onContactUpdated={handleContactUpdated} />
          </div>
        )}
      </div>

      <CreateReminderDialog
        open={createReminderOpen}
        onOpenChange={setCreateReminderOpen}
        contact={activeContact}
        conversationId={activeConversation?.id}
        onSaved={() => fetchUpcomingTasks()}
      />

      <ReminderCalendarModal
        open={calendarModalOpen}
        onOpenChange={setCalendarModalOpen}
        contact={activeContact}
      />
    </div>
  );
}
