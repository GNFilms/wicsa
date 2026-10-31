"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Palette,
  Sparkles,
  Globe,
  Upload,
  Check,
  RefreshCw,
  Sun,
  Moon,
  Save,
  MessageSquare,
  Shield,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranding } from "@/hooks/use-branding";
import { useTheme } from "@/hooks/use-theme";
import { THEMES, MODES, type ThemeId, type Mode } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

const COLOR_PRESETS = [
  { name: "Violet", hex: "#8b5cf6", themeId: "violet" },
  { name: "Emerald", hex: "#10b981", themeId: "emerald" },
  { name: "Cobalt", hex: "#3b82f6", themeId: "cobalt" },
  { name: "Amber", hex: "#f59e0b", themeId: "amber" },
  { name: "Rose", hex: "#f43f5e", themeId: "rose" },
  { name: "Cyan", hex: "#06b6d4", themeId: "cobalt" },
  { name: "Indigo", hex: "#6366f1", themeId: "violet" },
];

export function BrandingPanel() {
  const { branding, updateBranding, loading } = useBranding();
  const { theme, setTheme, mode, setMode } = useTheme();

  const [platformName, setPlatformName] = useState(branding.platform_name || "");
  const [logoUrl, setLogoUrl] = useState(branding.logo_url || "");
  const [faviconUrl, setFaviconUrl] = useState(branding.favicon_url || "");
  const [primaryColor, setPrimaryColor] = useState(branding.primary_color || "#8b5cf6");
  const [sidebarTheme, setSidebarTheme] = useState<string>(
    (branding.settings?.sidebar_theme as string) || "default"
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) {
      setPlatformName(branding.platform_name || "CRM Template for WhatsApp");
      setLogoUrl(branding.logo_url || "");
      setFaviconUrl(branding.favicon_url || "");
      setPrimaryColor(branding.primary_color || "#8b5cf6");
      setSidebarTheme((branding.settings?.sidebar_theme as string) || "default");
    }
  }, [branding, loading]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await updateBranding({
        platform_name: platformName.trim() || "CRM Template for WhatsApp",
        logo_url: logoUrl.trim() || null,
        favicon_url: faviconUrl.trim() || null,
        primary_color: primaryColor,
        settings: {
          ...branding.settings,
          sidebar_theme: sidebarTheme,
        },
      });

      if (ok) {
        toast.success("Customize Design settings saved successfully!");
      } else {
        toast.error("Failed to save branding settings");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while saving branding");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image file must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        setter(event.target.result);
        toast.success("Image loaded! Click 'Save Changes' to apply.");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Customize Design & Branding"
        description="Personalize your platform identity: configure your company logo, platform name, favicon, and visual theme."
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Platform Identity */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Platform Identity
            </CardTitle>
            <CardDescription>
              Set the public name and branding for your platform instance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platformName">Platform Name</Label>
              <Input
                id="platformName"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="e.g. Wicsa or Good News Films CRM"
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                Appears in the left navigation sidebar, browser tab title, and page headers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Brand Logos */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Logos & Favicon
            </CardTitle>
            <CardDescription>
              Upload or provide image URLs for your main sidebar logo and site favicon.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Main Logo */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
              <div className="space-y-2">
                <Label htmlFor="logoUrl">Main Logo (Sidebar & Header)</Label>
                <div className="flex gap-2">
                  <Input
                    id="logoUrl"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://... or upload image"
                    className="flex-1"
                  />
                  <Label
                    htmlFor="logoFile"
                    className="flex cursor-pointer items-center justify-center rounded-lg border border-input bg-muted px-3 text-xs font-medium hover:bg-muted/80 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Upload
                  </Label>
                  <input
                    id="logoFile"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, setLogoUrl)}
                  />
                </div>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setLogoUrl("")}
                  >
                    Remove Logo
                  </Button>
                )}
              </div>

              {/* Logo Preview */}
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">Logo Preview</p>
                <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-3">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="h-9 w-9 rounded-lg object-contain bg-background border border-border/50"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {platformName || "CRM Template for WhatsApp"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Main Platform Logo</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Site Favicon */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start pt-2 border-t border-border">
              <div className="space-y-2">
                <Label htmlFor="faviconUrl">Browser Tab Icon (Favicon)</Label>
                <div className="flex gap-2">
                  <Input
                    id="faviconUrl"
                    value={faviconUrl}
                    onChange={(e) => setFaviconUrl(e.target.value)}
                    placeholder="https://... or upload icon"
                    className="flex-1"
                  />
                  <Label
                    htmlFor="faviconFile"
                    className="flex cursor-pointer items-center justify-center rounded-lg border border-input bg-muted px-3 text-xs font-medium hover:bg-muted/80 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Upload
                  </Label>
                  <input
                    id="faviconFile"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, setFaviconUrl)}
                  />
                </div>
              </div>

              {/* Favicon Preview */}
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-2">Browser Tab Preview</p>
                <div className="inline-flex items-center gap-2 rounded-t-md border-t border-x border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm">
                  {faviconUrl ? (
                    <img src={faviconUrl} alt="Favicon" className="h-3.5 w-3.5 object-contain" />
                  ) : (
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="max-w-[140px] truncate">{platformName || "Wicsa"} — WhatsApp CRM</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Color and Theme Customization */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Theme & Colors
            </CardTitle>
            <CardDescription>
              Select your color mode and custom primary accent palette.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mode selection */}
            <div className="space-y-3">
              <Label>Interface Mode</Label>
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <button
                  type="button"
                  onClick={() => setMode("light")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                    mode === "light"
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Sun className="h-4 w-4" />
                  Light Mode
                  {mode === "light" && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("dark")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                    mode === "dark"
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Moon className="h-4 w-4" />
                  Dark Mode
                  {mode === "dark" && <Check className="h-3.5 w-3.5 ml-auto" />}
                </button>
              </div>
            </div>

            {/* Primary color presets */}
            <div className="space-y-3">
              <Label>Primary Brand Accent Color</Label>
              <div className="flex flex-wrap gap-2.5 items-center">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected =
                    primaryColor.toLowerCase() === preset.hex.toLowerCase() ||
                    theme === preset.themeId;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setPrimaryColor(preset.hex);
                        setTheme(preset.themeId as ThemeId);
                      }}
                      className={cn(
                        "group relative flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                        isSelected
                          ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground"
                          : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shadow-sm"
                        style={{ backgroundColor: preset.hex }}
                      />
                      {preset.name}
                      {isSelected && <Check className="h-3 w-3 text-primary" />}
                    </button>
                  );
                })}

                {/* Custom HEX Picker */}
                <div className="flex items-center gap-1.5 ml-2 border border-border rounded-lg px-2 py-1 bg-muted/30">
                  <span className="text-xs text-muted-foreground">Custom:</span>
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                  />
                  <span className="text-xs font-mono">{primaryColor}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Preview Card */}
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Live Theme Preview
            </span>
            <span className="text-xs text-muted-foreground">Instant Visual Verification</span>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-7 w-7 object-contain rounded" />
                ) : (
                  <div
                    className="h-7 w-7 rounded flex items-center justify-center text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                )}
                <span className="font-semibold text-sm text-foreground">
                  {platformName || "Wicsa"}
                </span>
              </div>
              <div className="flex gap-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Active Theme
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <div
                className="rounded-lg px-3 py-2 text-xs text-white flex items-center gap-1.5"
                style={{ backgroundColor: primaryColor }}
              >
                Primary Button
              </div>
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-medium text-foreground">
                Secondary Button
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="submit"
            disabled={saving}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px]"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
