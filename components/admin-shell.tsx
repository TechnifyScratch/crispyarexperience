"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, LayoutDashboard, MapPin, Settings, StickyNote } from "lucide-react";
import { AdminLogout } from "@/components/admin-logout";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/stats", label: "Stats", icon: BarChart3 },
  { href: "/admin/place", label: "Place", icon: MapPin },
  { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/admin/notes", label: "Notes", icon: StickyNote },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ children, previewMode }: { children: React.ReactNode; previewMode: boolean }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">(() => typeof window !== "undefined" && window.localStorage.getItem("crispy-admin-theme") === "dark" ? "dark" : "light");

  useEffect(() => {
    const update = (event: Event) => setTheme((event as CustomEvent<"light" | "dark">).detail);
    window.addEventListener("crispy-admin-theme", update);
    return () => window.removeEventListener("crispy-admin-theme", update);
  }, []);

  return (
    <div className="admin-shell" data-admin-theme={theme} suppressHydrationWarning>
      <aside className="admin-sidebar">
        <div className="admin-logo">Crispy Craig <span>Admin</span></div>
        <nav>{links.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? "active" : ""} href={href} key={href}><Icon size={16} /> <span>{label}</span></Link>)}</nav>
        <div className="admin-account-actions"><Link className="admin-exit" href="/">← Player site</Link><AdminLogout /></div>
      </aside>
      <div className="admin-main">
        <header className="admin-mobile-header"><strong>Crispy Craig Admin</strong><AdminLogout /></header>
        {previewMode && <div className="admin-preview">Preview mode: connect Supabase to enforce admin roles and save changes.</div>}
        {children}
        <nav className="admin-mobile-nav">{links.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? "active" : ""} href={href} key={href}><Icon size={17} /><span>{label}</span></Link>)}</nav>
      </div>
    </div>
  );
}
