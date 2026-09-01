import Link from "next/link";

export default function AdminDashboard() {
  return (
    <main className="admin-content">
      <div className="admin-heading"><div><p className="eyebrow">Crispy Craig admin</p><h1>Today’s hunt</h1></div><Link className="admin-primary" href="/admin/place">Hide Craig</Link></div>
      <section className="status-hero">
        <div className="status-live">Status: live now</div>
        <h2>Counter corner · Placement 04</h2>
        <p>Guests can hunt until 9:00 PM. Craig was last moved 2 days ago.</p>
        <div className="status-actions"><Link href="/admin/place">Preview placement</Link><button type="button">Pause today</button></div>
      </section>
      <section className="admin-stats">
        <article><small>Active placement</small><strong>Counter corner</strong><p>Map v1 · 78% confidence</p></article>
        <article><small>Next change</small><strong>Monday, 4 PM</strong><p>Weekly schedule</p></article>
        <article><small>Store map</small><strong>Ready</strong><p>Last scan 12 days ago</p></article>
      </section>
      <section className="admin-panel">
        <div className="panel-heading"><div><h2>Upcoming</h2><p>Local time · America/Los_Angeles</p></div><Link href="/admin/schedule">Edit schedule</Link></div>
        <div className="schedule-row"><div><strong>Monday hunt</strong><span>4:00 PM–9:00 PM</span></div><b>Placement 02</b></div>
        <div className="schedule-row"><div><strong>Wednesday hunt</strong><span>4:00 PM–9:00 PM</span></div><b>Placement 05</b></div>
        <div className="schedule-row"><div><strong>Saturday hunt</strong><span>12:00 PM–9:00 PM</span></div><b>Placement 04</b></div>
      </section>
    </main>
  );
}
