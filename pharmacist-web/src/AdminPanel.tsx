import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, BadgeCheck, Ban, Building2, CheckCircle2, Clock3, Database, Gauge, IndianRupee, LayoutDashboard, LogOut, Mail, MapPin,
  PackageCheck, RefreshCw, RotateCcw, ScanText, Search, ServerCog, ShieldCheck, ShoppingBag, Store, TrendingUp, UserPlus, Users, X,
} from "lucide-react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

import { AdminMetrics, AdminPharmacy, pharmacyAdminApi } from "./api";
import { BarList, ColumnChart, Panel, SERIES, TrendChart } from "./Charts";

const ADMIN_TOKEN_KEY = "justlocal_pharmacy_admin_token";
type AdminTab = "overview" | "applications" | "pharmacies" | "system";

function apiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The request failed. Please try again.";
  if ("status" in error && error.status === 503) return "Admin access is not configured on the backend. Set PHARMACY_ADMIN_TOKEN and restart the server.";
  if ("status" in error && error.status === 401) return "That admin token was not accepted.";
  return error.message;
}

const rupees = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${value}%`);
const ms = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${Math.round(value)} ms`);
function duration(seconds: number) {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function minutes(value: number | null) {
  if (value === null) return "—";
  return value < 1 ? `${Math.round(value * 60)} sec` : value < 60 ? `${value.toFixed(1)} min` : `${(value / 60).toFixed(1)} h`;
}

function Kpi({ icon, label, value, hint, tone = "teal" }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "teal" | "lime" | "amber" | "rose" | "ink" }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-icon">{icon}</span>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {hint ? <span className="kpi-hint">{hint}</span> : null}
    </div>
  );
}

function StatePill({ ok, label }: { ok: boolean | "warn"; label: string }) {
  return <span className={`pill ${ok === true ? "pill-verified" : ok === "warn" ? "pill-pending" : "pill-rejected"}`}>{label}</span>;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${status}`}>{status.replace(/_/g, " ")}</span>;
}

function MiniMap({ latitude, longitude }: { latitude?: number; longitude?: number }) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return <div className="mini-map empty">No map location</div>;
  return (
    <div className="mini-map">
      <MapContainer key={`${latitude},${longitude}`} center={[latitude, longitude]} zoom={15} scrollWheelZoom={false} style={{ width: "100%", height: "100%" }}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <CircleMarker center={[latitude, longitude]} radius={10} pathOptions={{ color: "#ffffff", weight: 3, fillColor: SERIES.teal, fillOpacity: 1 }} />
      </MapContainer>
    </div>
  );
}

export default function AdminPanel() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [tab, setTab] = useState<AdminTab>("overview");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [pharmacies, setPharmacies] = useState<AdminPharmacy[]>([]);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };

  const load = useCallback(async (adminToken: string, windowDays: number, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [nextMetrics, nextPharmacies] = await Promise.all([pharmacyAdminApi.metrics(adminToken, windowDays), pharmacyAdminApi.pharmacies(adminToken)]);
      setMetrics(nextMetrics);
      setPharmacies(nextPharmacies);
      setUpdatedAt(new Date());
      setError("");
    } catch (reason) {
      setError(apiErrorMessage(reason));
      if (reason && typeof reason === "object" && "status" in reason && reason.status === 401) {
        window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken("");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { if (token) void load(token, days); }, [token, days, load]);
  useEffect(() => {
    if (!token || !autoRefresh) return;
    const timer = window.setInterval(() => void load(token, days, true), 30000);
    return () => window.clearInterval(timer);
  }, [token, days, autoRefresh, load]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) return;
    setLoading(true);
    setError("");
    try {
      await pharmacyAdminApi.metrics(candidate, days);
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, candidate);
      setToken(candidate);
      setTokenInput("");
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  function disconnect() {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken("");
    setMetrics(null);
    setPharmacies([]);
  }

  async function moderate(action: "verify" | "reject" | "suspend" | "reinstate", pharmacy: AdminPharmacy, reason = "") {
    try {
      if (action === "verify") await pharmacyAdminApi.verify(token, pharmacy.id);
      if (action === "reject") await pharmacyAdminApi.reject(token, pharmacy.id, reason);
      if (action === "suspend") await pharmacyAdminApi.suspend(token, pharmacy.id, reason);
      if (action === "reinstate") await pharmacyAdminApi.reinstate(token, pharmacy.id);
      notify({ verify: `${pharmacy.name} is verified and can sign in.`, reject: `${pharmacy.name} was rejected.`, suspend: `${pharmacy.name} is suspended.`, reinstate: `${pharmacy.name} is active again.` }[action]);
      await load(token, days, true);
      return true;
    } catch (reason) {
      notify(apiErrorMessage(reason));
      return false;
    }
  }

  const pending = pharmacies.filter((pharmacy) => pharmacy.verification_status === "pending");

  if (!token) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <a className="brand-lockup" href="/" aria-label="Justlocal home"><span className="capsule-mark"><span /><i>+</i></span><span className="brand-name">Just<span>local</span></span></a>
          <span className="admin-kicker"><ShieldCheck size={14} /> ADMIN CONSOLE</span>
          <h1>Run the Justlocal network</h1>
          <p>Monitor performance, verify pharmacies and keep the marketplace healthy. Use the admin token configured on the backend; it stays in this browser tab only.</p>
          <form onSubmit={connect} className="admin-token-form">
            <label className="form-label">Admin token<input type="password" autoComplete="current-password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} required /></label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="button button-primary" disabled={loading}>{loading ? "Connecting…" : "Open admin console"}</button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={17} /> },
    { id: "applications", label: "Applications", icon: <BadgeCheck size={17} />, count: pending.length },
    { id: "pharmacies", label: "Pharmacies", icon: <Store size={17} /> },
    { id: "system", label: "System health", icon: <ServerCog size={17} /> },
  ];

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand-lockup" href="/" aria-label="Justlocal home"><span className="capsule-mark"><span /><i>+</i></span><span className="brand-name">Just<span>local</span></span></a>
        <nav className="admin-tabs" role="tablist">
          {tabs.map((item) => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} className={`admin-tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
              {item.icon}<span>{item.label}</span>{item.count ? <b>{item.count}</b> : null}
            </button>
          ))}
        </nav>
        <div className="admin-actions">
          <label className="auto-refresh" title="Refresh every 30 seconds">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span className="switch" /><span>Live</span>
          </label>
          <button className="icon-button" aria-label="Refresh now" onClick={() => void load(token, days)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
          <button className="icon-button" aria-label="Sign out" onClick={disconnect}><LogOut size={16} /></button>
        </div>
      </header>

      <main className="admin-content">
        {error && <div className="auth-error admin-error" role="alert">{error}</div>}
        {!metrics ? <div className="admin-empty"><RefreshCw size={22} className="spin" /><strong>Loading the console…</strong></div> : (
          <div key={tab} className="tab-enter">
            {tab === "overview" && <Overview metrics={metrics} days={days} onDays={setDays} updatedAt={updatedAt} onApplications={() => setTab("applications")} />}
            {tab === "applications" && <Applications pending={pending} onModerate={moderate} />}
            {tab === "pharmacies" && <Directory pharmacies={pharmacies} onModerate={moderate} />}
            {tab === "system" && <SystemHealth metrics={metrics} />}
          </div>
        )}
      </main>
      {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}</div>}
    </div>
  );
}

function PageHead({ kicker, title, children, actions }: { kicker: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="admin-page-heading">
      <div><div className="admin-kicker">{kicker}</div><h1>{title}</h1>{children ? <p>{children}</p> : null}</div>
      {actions}
    </div>
  );
}

function Overview({ metrics, days, onDays, updatedAt, onApplications }: { metrics: AdminMetrics; days: number; onDays: (value: number) => void; updatedAt: Date | null; onApplications: () => void }) {
  const { users, requests, orders, pharmacies, offers } = metrics;
  const statusLabels: Record<string, string> = { collecting_offers: "Waiting for offers", order_placed: "Order placed", revoked: "Withdrawn", expired: "Expired", no_pharmacies: "No pharmacy matched", dispatching: "Dispatching", selecting_offer: "Selecting offer" };
  return (
    <>
      <PageHead kicker="PERFORMANCE" title="Network overview" actions={
        <div className="segmented-control" role="group" aria-label="Date range">
          {[7, 14, 30].map((value) => <button key={value} className={days === value ? "active" : ""} onClick={() => onDays(value)}>{value} days</button>)}
        </div>
      }>
        Live numbers from the shared database{updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}.
      </PageHead>

      {pharmacies.pending > 0 && (
        <button className="attention-banner" onClick={onApplications}>
          <BadgeCheck size={18} /><span><strong>{pharmacies.pending} pharmacy {pharmacies.pending === 1 ? "application needs" : "applications need"} review.</strong> Open applications</span>
        </button>
      )}

      <div className="kpi-grid">
        <Kpi icon={<Users size={18} />} label="Customers" value={users.total.toLocaleString()} hint={`${users.new_7d} new this week · ${users.new_30d} in 30 days`} />
        <Kpi icon={<Activity size={18} />} label="Active this week" value={users.active_7d.toLocaleString()} hint={`${users.ordering_customers} have ordered`} tone="lime" />
        <Kpi icon={<ShoppingBag size={18} />} label="Requests (7 days)" value={requests.last_7d.toLocaleString()} hint={`${requests.total} all time · ${requests.with_prescription} with prescription`} tone="ink" />
        <Kpi icon={<TrendingUp size={18} />} label="Request → order" value={pct(orders.conversion_rate)} hint={`${orders.total} orders from ${requests.total} requests`} />
        <Kpi icon={<IndianRupee size={18} />} label="Order value" value={rupees(orders.gross_value)} hint={`Average ${rupees(orders.avg_order_value)}`} tone="lime" />
        <Kpi icon={<Clock3 size={18} />} label="First offer (median)" value={minutes(requests.median_first_offer_minutes)} hint={`90% within ${minutes(requests.p90_first_offer_minutes)}`} tone="amber" />
      </div>

      <div className="dash-grid">
        <Panel title="Requests and orders" subtitle={`Per day, last ${days} days`} className="span-2">
          <TrendChart data={metrics.daily} series={[{ key: "requests", label: "Requests", color: SERIES.teal }, { key: "orders", label: "Orders", color: SERIES.orange }]} />
        </Panel>
        <Panel title="Conversion funnel" subtitle="All time">
          <BarList rows={[
            { label: "Requests sent", value: requests.total },
            { label: "Got an offer", value: requests.with_offers },
            { label: "Order placed", value: orders.total },
            { label: "Delivered", value: orders.delivered },
          ]} />
          <div className="mini-stats">
            <span><strong>{pct(requests.response_rate)}</strong> of routed requests got an offer</span>
            <span><strong>{requests.avg_pharmacies_matched}</strong> pharmacies asked per request</span>
          </div>
        </Panel>
        <Panel title="Request outcomes">
          <BarList rows={Object.entries(requests.by_status).sort((a, b) => b[1] - a[1]).map(([status, value]) => ({ label: statusLabels[status] ?? status, value }))} />
        </Panel>
        <Panel title="Most requested medicines" subtitle="By quantity">
          <BarList rows={metrics.top_medicines.map((row) => ({ label: row.name, value: row.quantity }))} empty="No requests yet" />
        </Panel>
        <Panel title="Pharmacy offers">
          <BarList color={SERIES.orange} rows={[
            { label: "Full availability", value: offers.available },
            { label: "Partial", value: offers.partial },
            { label: "Unable to fulfil", value: offers.unavailable },
            { label: "Chosen by customer", value: offers.selected },
          ]} />
        </Panel>
        <Panel title="Top pharmacies" subtitle="By orders" className="span-2">
          {metrics.top_pharmacies.length ? (
            <table className="data-table">
              <thead><tr><th>Pharmacy</th><th>Offers sent</th><th>Orders</th><th>Order value</th><th>Win rate</th></tr></thead>
              <tbody>{metrics.top_pharmacies.map((row) => (
                <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.offers}</td><td>{row.orders}</td><td>{rupees(row.value)}</td><td>{row.offers ? `${Math.round((100 * row.orders) / row.offers)}%` : "—"}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="viz-empty">No orders yet</p>}
        </Panel>
        <Panel title="Pharmacy network">
          <div className="network-grid">
            <div><strong>{pharmacies.verified}</strong><span>Verified</span></div>
            <div><strong>{pharmacies.accepting}</strong><span>Accepting now</span></div>
            <div><strong>{pharmacies.pending}</strong><span>Pending</span></div>
            <div><strong>{pharmacies.suspended + pharmacies.rejected}</strong><span>Suspended / rejected</span></div>
          </div>
          <h3 className="panel-subhead">Customer sign-in methods</h3>
          <BarList rows={Object.entries(users.sign_in_methods).map(([method, value]) => ({ label: method[0].toUpperCase() + method.slice(1), value }))} />
        </Panel>
      </div>
    </>
  );
}

function Applications({ pending, onModerate }: { pending: AdminPharmacy[]; onModerate: (action: "verify" | "reject", pharmacy: AdminPharmacy, reason?: string) => Promise<boolean> }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirming, setConfirming] = useState<"verify" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = pending.find((pharmacy) => pharmacy.id === selectedId) ?? pending[0] ?? null;

  async function run(action: "verify" | "reject") {
    if (!selected) return;
    setBusy(true);
    const ok = await onModerate(action, selected, reason.trim());
    setBusy(false);
    if (ok) { setConfirming(null); setReason(""); setSelectedId(""); }
  }

  return (
    <>
      <PageHead kicker="VERIFICATION" title="Pharmacy applications">Check the licence and location, then approve or reject. Pharmacists must verify their email before approval.</PageHead>
      {pending.length === 0 ? (
        <div className="admin-empty"><BadgeCheck size={26} /><strong>All caught up</strong><span>New pharmacy registrations will appear here.</span></div>
      ) : (
        <div className="review-layout">
          <div className="review-list">
            {pending.map((pharmacy) => (
              <button key={pharmacy.id} className={`review-item ${selected?.id === pharmacy.id ? "active" : ""}`} onClick={() => { setSelectedId(pharmacy.id); setConfirming(null); }}>
                <span className="review-avatar"><Building2 size={18} /></span>
                <span className="review-copy"><strong>{pharmacy.name}</strong><small>{pharmacy.pharmacist?.name ?? "Unknown pharmacist"} · {pharmacy.created_at ? new Date(pharmacy.created_at).toLocaleDateString() : ""}</small></span>
                {pharmacy.pharmacist?.email_verified === false ? <span className="pill pill-pending">email pending</span> : <span className="pill pill-verified">ready</span>}
              </button>
            ))}
          </div>
          {selected && (
            <article className="review-detail">
              <div className="review-detail-head">
                <div><h2>{selected.name}</h2><p><MapPin size={14} /> {selected.address}</p></div>
                <StatusPill status="pending" />
              </div>
              <MiniMap latitude={selected.latitude} longitude={selected.longitude} />
              <dl className="detail-grid">
                <div><dt>Licence number</dt><dd>{selected.license_number}</dd></div>
                <div><dt>Pharmacist</dt><dd>{selected.pharmacist?.name ?? "—"}</dd></div>
                <div><dt>Email</dt><dd>{selected.pharmacist?.email ?? "—"} {selected.pharmacist?.email_verified === false ? <span className="pill pill-pending">not verified</span> : <span className="pill pill-verified">verified</span>}</dd></div>
                <div><dt>Phone</dt><dd>{selected.pharmacist?.phone ?? "—"}</dd></div>
                <div><dt>Coordinates</dt><dd>{selected.latitude?.toFixed(5)}, {selected.longitude?.toFixed(5)}</dd></div>
                <div><dt>Submitted</dt><dd>{selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"}</dd></div>
              </dl>
              {confirming ? (
                <div className={`confirm-box ${confirming}`}>
                  <strong>{confirming === "verify" ? `Approve ${selected.name}?` : `Reject ${selected.name}?`}</strong>
                  <span>{confirming === "verify" ? "The pharmacist can sign in and will start receiving nearby requests." : "The pharmacist will see that the application was not approved."}</span>
                  {confirming === "reject" && <textarea placeholder="Reason (kept on record)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />}
                  <div className="confirm-actions">
                    <button className="button button-quiet" onClick={() => setConfirming(null)} disabled={busy}>Cancel</button>
                    <button className={`button ${confirming === "verify" ? "button-primary" : "button-danger"}`} onClick={() => void run(confirming)} disabled={busy}>{busy ? "Saving…" : confirming === "verify" ? "Yes, approve" : "Yes, reject"}</button>
                  </div>
                </div>
              ) : (
                <div className="review-actions">
                  <button className="button button-danger-quiet" onClick={() => setConfirming("reject")}><X size={16} />Reject</button>
                  <button className="button button-primary" onClick={() => setConfirming("verify")} disabled={selected.pharmacist?.email_verified === false} title={selected.pharmacist?.email_verified === false ? "Waiting for the pharmacist to verify their email" : undefined}><BadgeCheck size={16} />Approve pharmacy</button>
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </>
  );
}

function Directory({ pharmacies, onModerate }: { pharmacies: AdminPharmacy[]; onModerate: (action: "suspend" | "reinstate", pharmacy: AdminPharmacy, reason?: string) => Promise<boolean> }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const counts = useMemo(() => pharmacies.reduce<Record<string, number>>((acc, pharmacy) => { acc[pharmacy.verification_status] = (acc[pharmacy.verification_status] ?? 0) + 1; return acc; }, {}), [pharmacies]);
  const visible = pharmacies.filter((pharmacy) => (filter === "all" || pharmacy.verification_status === filter)
    && (!query.trim() || [pharmacy.name, pharmacy.area, pharmacy.address, pharmacy.pharmacist?.email, pharmacy.license_number].join(" ").toLowerCase().includes(query.trim().toLowerCase())));
  return (
    <>
      <PageHead kicker="NETWORK" title="Pharmacy directory">Every pharmacy on Justlocal, with activity and controls.</PageHead>
      <div className="directory-toolbar">
        <div className="chip-row">
          {["all", "verified", "pending", "suspended", "rejected"].map((status) => (
            <button key={status} className={`chip ${filter === status ? "active" : ""}`} onClick={() => setFilter(status)}>
              {status === "all" ? "All" : status[0].toUpperCase() + status.slice(1)} <b>{status === "all" ? pharmacies.length : counts[status] ?? 0}</b>
            </button>
          ))}
        </div>
        <label className="search-field"><Search size={16} /><input placeholder="Search name, area, email, licence" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="dash-panel table-panel">
        <table className="data-table">
          <thead><tr><th>Pharmacy</th><th>Status</th><th>Accepting</th><th>Medicines listed</th><th>Orders</th><th>Pharmacist</th><th /></tr></thead>
          <tbody>
            {visible.map((pharmacy) => (
              <Fragment key={pharmacy.id}>
                <tr className={openId === pharmacy.id ? "row-open" : ""}>
                  <td><strong>{pharmacy.name}</strong><small>{pharmacy.area ?? pharmacy.address ?? ""}</small></td>
                  <td><StatusPill status={pharmacy.verification_status} /></td>
                  <td>{pharmacy.verification_status === "verified" ? (pharmacy.accepting_requests ? <span className="dot-label on">Yes</span> : <span className="dot-label">Paused</span>) : "—"}</td>
                  <td>{pharmacy.carried_medicines}</td>
                  <td>{pharmacy.orders}</td>
                  <td>{pharmacy.pharmacist ? <><span>{pharmacy.pharmacist.name}</span><small>{pharmacy.pharmacist.email}{pharmacy.pharmacist.email_verified ? "" : " · email unverified"}</small></> : <small>Seeded listing</small>}</td>
                  <td className="row-actions">
                    {pharmacy.verification_status === "verified" && <button className="button button-small button-danger-quiet" onClick={() => { setOpenId(openId === pharmacy.id ? null : pharmacy.id); setReason(""); }}><Ban size={14} />Suspend</button>}
                    {pharmacy.verification_status === "suspended" && <button className="button button-small button-secondary" onClick={() => void onModerate("reinstate", pharmacy)}><RotateCcw size={14} />Reinstate</button>}
                  </td>
                </tr>
                {openId === pharmacy.id && (
                  <tr className="confirm-row">
                    <td colSpan={7}>
                      <div className="confirm-box reject inline">
                        <strong>Suspend {pharmacy.name}?</strong>
                        <span>Its pharmacists are signed out at once and it stops receiving requests until reinstated.</span>
                        <textarea placeholder="Reason (kept on record)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
                        <div className="confirm-actions">
                          <button className="button button-quiet" onClick={() => setOpenId(null)}>Cancel</button>
                          <button className="button button-danger" onClick={() => void onModerate("suspend", pharmacy, reason.trim()).then((ok) => ok && setOpenId(null))}>Yes, suspend</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="viz-empty">No pharmacies match.</p>}
      </div>
    </>
  );
}

function SystemHealth({ metrics }: { metrics: AdminMetrics }) {
  const s = metrics.system;
  const healthy = s.server_error_rate < 1 && (s.p95_ms ?? 0) < 1500 && s.db_ping_ms !== null;
  return (
    <>
      <PageHead kicker="RELIABILITY" title="System health">API speed and errors over the last 24 hours. Counts reset when the backend restarts (up {duration(s.uptime_seconds)}).</PageHead>
      <div className={`health-banner ${healthy ? "ok" : "warn"}`}>
        {healthy ? <CheckCircle2 size={20} /> : <Gauge size={20} />}
        <span><strong>{healthy ? "All systems normal" : "Needs attention"}</strong> · {s.requests_24h.toLocaleString()} API calls · {s.server_error_rate}% server errors</span>
      </div>
      <div className="kpi-grid">
        <Kpi icon={<Gauge size={18} />} label="Typical response (p50)" value={ms(s.p50_ms)} hint="Half of calls are faster" />
        <Kpi icon={<Gauge size={18} />} label="Slow responses (p95)" value={ms(s.p95_ms)} hint={`p99 ${ms(s.p99_ms)}`} tone="amber" />
        <Kpi icon={<Activity size={18} />} label="Server errors" value={`${s.server_error_rate}%`} hint={`${s.client_error_rate}% client errors (4xx)`} tone={s.server_error_rate >= 1 ? "rose" : "lime"} />
        <Kpi icon={<Database size={18} />} label="Database ping" value={ms(s.db_ping_ms)} hint="MongoDB round trip" tone="ink" />
      </div>
      <div className="dash-grid">
        <Panel title="Slow-response time by hour" subtitle="95th percentile, last 24 hours (hours ago → now)" className="span-2">
          <ColumnChart label="p95 latency" format={(value) => `${Math.round(value)} ms`}
            data={s.latency_by_hour.map((row) => ({ key: `${23 - row.hour}h`, value: row.p95_ms, detail: `${row.calls} calls` }))} />
        </Panel>
        <Panel title="Integrations">
          <ul className="integration-list">
            <li><Mail size={17} /><span>Email delivery</span>{s.email_provider !== "none" ? <StatePill ok label="Connected" /> : s.email_dev_mode ? <StatePill ok="warn" label="Dev mode" /> : <StatePill ok={false} label="Not set up" />}<small>{s.email_provider === "none" ? "No provider configured" : `via ${s.email_provider.toUpperCase()}`}{s.email_dev_mode ? " · codes shown in API (dev only)" : ""}</small></li>
            <li><ScanText size={17} /><span>Prescription OCR</span>{s.ocr_provider === "none" ? <StatePill ok="warn" label="Manual only" /> : <StatePill ok label="Connected" />}<small>{s.ocr_provider === "veryfi" ? "Veryfi (with customer consent), Tesseract fallback" : s.ocr_provider === "tesseract" ? "Local Tesseract" : "Pharmacists read prescriptions"}</small></li>
            <li><PackageCheck size={17} /><span>Medicine catalog</span>{s.catalog_size ? <StatePill ok label="Loaded" /> : <StatePill ok={false} label="Empty" />}<small>{s.catalog_size.toLocaleString()} medicines</small></li>
            <li><UserPlus size={17} /><span>Customer accounts</span><StatePill ok label="Open" /><small>{metrics.users.total} accounts · {metrics.users.email_verified} email-verified</small></li>
          </ul>
        </Panel>
        <Panel title="Busiest endpoints" subtitle="Last 24 hours" className="span-3">
          {s.endpoints.length ? (
            <table className="data-table">
              <thead><tr><th>Endpoint</th><th>Calls</th><th>p50</th><th>p95</th><th>Server errors</th></tr></thead>
              <tbody>{s.endpoints.map((row) => (
                <tr key={row.route}><td><code>{row.route}</code></td><td>{row.calls}</td><td>{ms(row.p50_ms)}</td><td>{ms(row.p95_ms)}</td><td>{row.error_rate ? <span className="pill pill-rejected">{row.error_rate}%</span> : "0%"}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="viz-empty">No traffic recorded since the last restart.</p>}
        </Panel>
      </div>
    </>
  );
}
