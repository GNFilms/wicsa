"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AccountBranding } from "@/types";

const BRANDING_STORAGE_KEY = "wacrm.branding";

const DEFAULT_BRANDING: AccountBranding = {
  account_id: "",
  platform_name: "CRM Template for WhatsApp",
  logo_url: null,
  favicon_url: null,
  primary_color: "#8b5cf6",
  settings: {
    mode: "dark",
    sidebar_theme: "default",
    border_radius: "rounded",
  },
};

interface BrandingContextType {
  branding: AccountBranding;
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  updateBranding: (updates: Partial<AccountBranding>) => Promise<boolean>;
  loading: boolean;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  platformName: DEFAULT_BRANDING.platform_name,
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#8b5cf6",
  updateBranding: async () => false,
  loading: false,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<AccountBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  // Restore cached branding immediately from localStorage to prevent flash
  useEffect(() => {
    try {
      const cached = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setBranding((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Fetch latest branding from server
  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/account/branding", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { branding: AccountBranding };
        if (data.branding) {
          setBranding(data.branding);
          try {
            localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(data.branding));
          } catch {
            // Ignore
          }
        }
      }
    } catch (err) {
      console.warn("[BrandingProvider] fetch failed, using cached:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Update dynamic document favicon and title prefix if set
  useEffect(() => {
    if (branding.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }
  }, [branding.favicon_url]);

  const updateBranding = useCallback(async (updates: Partial<AccountBranding>) => {
    const nextBranding = { ...branding, ...updates };
    setBranding(nextBranding);
    try {
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(nextBranding));
    } catch {
      // Ignore
    }

    try {
      const res = await fetch("/api/account/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextBranding),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.branding) {
          setBranding(data.branding);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error("[updateBranding] failed:", err);
      return false;
    }
  }, [branding]);

  return (
    <BrandingContext.Provider
      value={{
        branding,
        platformName: branding.platform_name || "CRM Template for WhatsApp",
        logoUrl: branding.logo_url,
        faviconUrl: branding.favicon_url,
        primaryColor: branding.primary_color || "#8b5cf6",
        updateBranding,
        loading,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
