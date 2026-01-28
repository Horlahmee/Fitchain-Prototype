"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { theme } from "../lib/theme";

type Tab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match?: (pathname: string) => boolean;
};

function IconHome({ active }: { active: boolean }) {
  const opacity = active ? 1 : 0.75;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <path
        d="M3 10.5L12 3l9 7.5V21H15v-6H9v6H3V10.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconActivity({ active }: { active: boolean }) {
  const opacity = active ? 1 : 0.75;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <path
        d="M6 13l3-10 6 18 3-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M3 13h3m12 0h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconCommunity({ active }: { active: boolean }) {
  const opacity = active ? 1 : 0.75;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <path
        d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3.5 20a4.5 4.5 0 0 1 9 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M11.5 20a4.5 4.5 0 0 1 9 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMarketplace({ active }: { active: boolean }) {
  const opacity = active ? 1 : 0.75;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <path
        d="M6 7V6a6 6 0 0 1 12 0v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 7h14l-1 14H6L5 7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  const opacity = active ? 1 : 0.75;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 21a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TabBar() {
  const pathname = usePathname() || "/";

  const tabs: Tab[] = [
    {
      href: "/",
      label: "Home",
      icon: <IconHome active={pathname === "/"} />,
      match: (p) => p === "/",
    },
    {
      href: "/activity",
      label: "Activity",
      icon: <IconActivity active={pathname.startsWith("/activity")} />,
      match: (p) => p.startsWith("/activity"),
    },
    {
      href: "/community",
      label: "Community",
      icon: <IconCommunity active={pathname.startsWith("/community")} />,
      match: (p) => p.startsWith("/community"),
    },
    {
      href: "/marketplace",
      label: "Marketplace",
      icon: <IconMarketplace active={pathname.startsWith("/marketplace")} />,
      match: (p) => p.startsWith("/marketplace"),
    },
    {
      href: "/profile",
      label: "Profile",
      icon: <IconProfile active={pathname.startsWith("/profile") || pathname.startsWith("/settings")} />,
      match: (p) => p.startsWith("/profile") || p.startsWith("/settings"),
    },
  ];

  return (
    <nav
      aria-label="Bottom navigation"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 72,
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(16px)",
        borderTop: `1px solid ${theme.colors.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        zIndex: 50,
      }}
    >
      {tabs.map((t) => {
        const active = t.match ? t.match(pathname) : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-label={t.label}
            style={{
              width: 54,
              height: 46,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: active ? theme.colors.accent : "rgba(255,255,255,0.80)",
              background: active ? theme.colors.accentSoft : "transparent",
              border: active ? `1px solid ${theme.colors.accentSoft}` : "1px solid transparent",
              boxShadow: active ? `0 8px 18px ${theme.colors.accentGlow}` : "none",
              textDecoration: "none",
            }}
          >
            {t.icon}
          </Link>
        );
      })}
    </nav>
  );
}
