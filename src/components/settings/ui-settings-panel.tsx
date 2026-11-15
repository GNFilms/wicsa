"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  SlidersHorizontal,
  Layout,
  Sidebar as SidebarIcon,
  Bell,
  Image as ImageIcon,
  Check,
  RotateCcw,
  Sparkles,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface UiPreferences {
  sidebarCollapsed: boolean;
  sidebarHoverExpand: boolean;
  showBetaChips: boolean;
  showInboxTopBar: boolean;
  contactPanelDefaultOpen: boolean;
  chatDensity: "comfortable" | "compact";
  showContactPhotos: boolean;
}

const DEFAULT_PREFS: UiPreferences = {
  sidebarCollapsed: false,
  sidebarHoverExpand: true,
  showBetaChips: true,
  showInboxTopBar: true,
  contactPanelDefaultOpen: true,
  chatDensity: "comfortable",
  showContactPhotos: true,
};

export function UiSettingsPanel() {
  const [prefs, setPrefs] = useState<UiPreferences>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("wacrm:ui:preferences");
      const sidebarStored = localStorage.getItem("wacrm:ui:sidebar-collapsed");
      if (stored) {
        setPrefs(JSON.parse(stored));
      } else if (sidebarStored !== null) {
        setPrefs((prev) => ({
          ...prev,
          sidebarCollapsed: sidebarStored === "true",
        }));
      }
    } catch {}
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem("wacrm:ui:preferences", JSON.stringify(prefs));
      localStorage.setItem("wacrm:ui:sidebar-collapsed", String(prefs.sidebarCollapsed));
      setSaved(true);
      toast.success("UI settings saved successfully!");
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save UI settings");
    }
  };

  const handleReset = () => {
    setPrefs(DEFAULT_PREFS);
    try {
      localStorage.removeItem("wacrm:ui:preferences");
      localStorage.setItem("wacrm:ui:sidebar-collapsed", "false");
      toast.info("Reset to default settings");
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">UI & Interface Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customize platform layout, sidebar minimization, top bar options, and contact display.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Main Menu & Sidebar */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <SidebarIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Sidebar Navigation</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Default State */}
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <Label className="text-xs font-semibold text-foreground">Default Sidebar State</Label>
            <p className="text-[11px] text-muted-foreground">
              Choose whether the left main menu starts expanded or shrinked to the left.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, sidebarCollapsed: false }))}
                className={`flex-1 rounded-lg border p-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  !prefs.sidebarCollapsed
                    ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
                Expanded
              </button>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, sidebarCollapsed: true }))}
                className={`flex-1 rounded-lg border p-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                  prefs.sidebarCollapsed
                    ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
                Minimized / Left
              </button>
            </div>
          </div>

          {/* Hover Expand */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <div className="space-y-0.5 pr-2">
              <Label className="text-xs font-semibold text-foreground">Hover / Click to Reveal</Label>
              <p className="text-[11px] text-muted-foreground">
                When minimized, hovering over the menu or clicking &apos;&gt;&apos; will reveal the full menu.
              </p>
            </div>
            <input
              type="checkbox"
              checked={prefs.sidebarHoverExpand}
              onChange={(e) => setPrefs((p) => ({ ...p, sidebarHoverExpand: e.target.checked }))}
              className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            />
          </div>
        </div>

        {/* Beta Chips */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3.5">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold text-foreground">Show Beta Feature Chips</Label>
            <p className="text-[11px] text-muted-foreground">
              Display &quot;Beta&quot; tags on newly launched features (e.g. Flows) in navigation.
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.showBetaChips}
            onChange={(e) => setPrefs((p) => ({ ...p, showBetaChips: e.target.checked }))}
            className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
          />
        </div>
      </div>

      {/* Section 2: Inbox & Workspace Layout */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Layout className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Inbox Workspace & Top Bar</h3>
        </div>

        <div className="space-y-3">
          {/* Top Quick Bar */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <div className="space-y-0.5 pr-2">
              <Label className="text-xs font-semibold text-foreground">
                Inbox Top Empty Space Options & Reminders
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Utilize the top header bar to display upcoming reminders, tasks, and quick actions.
              </p>
            </div>
            <input
              type="checkbox"
              checked={prefs.showInboxTopBar}
              onChange={(e) => setPrefs((p) => ({ ...p, showInboxTopBar: e.target.checked }))}
              className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            />
          </div>

          {/* Contact Details Panel Default */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <div className="space-y-0.5 pr-2">
              <Label className="text-xs font-semibold text-foreground">
                Right Contact Details Panel Open by Default
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Keep the right client sidebar open by default on desktop screens.
              </p>
            </div>
            <input
              type="checkbox"
              checked={prefs.contactPanelDefaultOpen}
              onChange={(e) => setPrefs((p) => ({ ...p, contactPanelDefaultOpen: e.target.checked }))}
              className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Contact Photos & Media */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <ImageIcon className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Contact Photos & Upload Rules</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3.5">
            <div className="space-y-0.5 pr-2">
              <Label className="text-xs font-semibold text-foreground">
                Display Attached Contact Photos
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Show attached circular profile pictures across conversations and contacts.
              </p>
            </div>
            <input
              type="checkbox"
              checked={prefs.showContactPhotos}
              onChange={(e) => setPrefs((p) => ({ ...p, showContactPhotos: e.target.checked }))}
              className="size-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            />
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              <span>Screenshot Paste & Size Limit Notice</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
              Max file size for contact photos is 2 MB. When users upload files larger than 2 MB, the platform prompts:
              <span className="font-semibold text-foreground block mt-0.5">
                &ldquo;bigger image size , Take it&apos;s screenshot & paste it here&rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Defaults
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Check className="h-3.5 w-3.5" />
          {saved ? "Saved!" : "Save UI Settings"}
        </Button>
      </div>
    </div>
  );
}
