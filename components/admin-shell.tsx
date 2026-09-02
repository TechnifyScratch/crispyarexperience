import Link from "next/link";
import { AdminLogout } from "@/components/admin-logout";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/place", label: "Place Craig" },
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({ children, previewMode }: { children: React.ReactNode; previewMode: boolean }) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-logo">Crispy Craig <span>Admin</span></div>
        <nav>{links.map(({ href, label }) => <Link href={href} key={href}>{label}</Link>)}</nav>
        <div className="admin-account-actions"><Link className="admin-exit" href="/">← Player site</Link><AdminLogout /></div>
      </aside>
      <div className="admin-main">
        <header className="admin-mobile-header"><strong>Crispy Craig Admin</strong><AdminLogout /></header>
        {previewMode && <div className="admin-preview">Preview mode: connect Supabase to enforce admin roles and save changes.</div>}
        {children}
        <nav className="admin-mobile-nav">{links.map(({ href, label }) => <Link href={href} key={href}>{label}</Link>)}</nav>
      </div>
    </div>
  );
}
