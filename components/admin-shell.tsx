import Link from "next/link";
import { CalendarDays, ChevronLeft, Eye, LayoutDashboard, MapPin, Settings2 } from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/place", label: "Place Craig", icon: MapPin },
  { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/admin/settings", label: "Settings", icon: Settings2 },
];

export function AdminShell({ children, previewMode }: { children: React.ReactNode; previewMode: boolean }) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-logo">CC<span>Admin</span></div>
        <nav>{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={19} />{label}</Link>)}</nav>
        <Link className="admin-exit" href="/"><ChevronLeft size={18} /> Player site</Link>
      </aside>
      <div className="admin-main">
        <header className="admin-mobile-header"><strong>CC Admin</strong><Link href="/"><Eye size={18} /> Player view</Link></header>
        {previewMode && <div className="admin-preview">Preview mode: connect Supabase to enforce admin roles and save changes.</div>}
        {children}
        <nav className="admin-mobile-nav">{links.slice(0, 4).map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={19} /><span>{label}</span></Link>)}</nav>
      </div>
    </div>
  );
}
