import { FormEvent, useEffect, useState } from "react";
import { BadgeCheck, Building2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

import { PendingPharmacy, pharmacyAdminApi } from "./api";

const ADMIN_TOKEN_KEY = "justlocal_pharmacy_admin_token";

function apiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "The request failed. Please try again.";
  if ("status" in error && error.status === 503) {
    return "Admin access is not configured on the backend. Set PHARMACY_ADMIN_TOKEN in the backend environment and restart the server.";
  }
  if ("status" in error && error.status === 401) return "That admin token was not accepted.";
  return error.message;
}

export default function AdminPanel() {
  const [token, setToken] = useState(() => window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [applications, setApplications] = useState<PendingPharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadApplications(adminToken: string) {
    setLoading(true);
    setError("");
    try {
      setApplications(await pharmacyAdminApi.pending(adminToken));
    } catch (reason) {
      setError(apiErrorMessage(reason));
      if (reason && typeof reason === "object" && "status" in reason && reason.status === 401) {
        window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void loadApplications(token);
  }, [token]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = tokenInput.trim();
    if (!candidate) return;
    setLoading(true);
    setError("");
    try {
      const result = await pharmacyAdminApi.pending(candidate);
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, candidate);
      setApplications(result);
      setToken(candidate);
      setTokenInput("");
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  async function verify(pharmacy: PendingPharmacy) {
    if (!token || !window.confirm(`Verify ${pharmacy.name}? This enables its pharmacist account and request matching.`)) return;
    setVerifyingId(pharmacy.id);
    setError("");
    try {
      await pharmacyAdminApi.verify(token, pharmacy.id);
      setApplications((current) => current.filter((application) => application.id !== pharmacy.id));
    } catch (reason) {
      setError(apiErrorMessage(reason));
    } finally {
      setVerifyingId(null);
    }
  }

  function disconnect() {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken("");
    setApplications([]);
    setError("");
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="brand-lockup" href="/" aria-label="Justlocal pharmacy home">
          <span className="capsule-mark"><span /><i>+</i></span>
          <span className="brand-name">Just<span>local</span></span>
        </a>
        <div className="admin-heading"><ShieldCheck size={17} /><span>Pharmacy verification</span></div>
        {token && <button className="button button-quiet admin-disconnect" onClick={disconnect}><LogOut size={15} />Sign out</button>}
      </header>

      <main className="admin-content">
        {!token ? (
          <section className="admin-connect">
            <div className="admin-kicker">ADMIN ACCESS</div>
            <h1>Verify pharmacy applications</h1>
            <p>Use the admin token configured on the Justlocal backend. The token is kept only for this browser tab.</p>
            <form onSubmit={connect} className="admin-token-form">
              <label className="form-label">Admin token<input type="password" autoComplete="current-password" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} required /></label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="button button-primary" disabled={loading}>{loading ? "Connecting…" : "Open verification desk"}</button>
            </form>
          </section>
        ) : (
          <>
            <div className="admin-page-heading">
              <div><div className="admin-kicker">OPERATIONS</div><h1>Pharmacy applications</h1><p>Review pharmacy details and license information before enabling access.</p></div>
              <button className="button button-secondary" onClick={() => void loadApplications(token)} disabled={loading}><RefreshCw size={15} />Refresh</button>
            </div>
            {error && <div className="auth-error admin-error" role="alert">{error}</div>}
            <section className="admin-summary"><span className="admin-summary-icon"><Building2 size={18} /></span><div><strong>{applications.length}</strong><span>Pending {applications.length === 1 ? "application" : "applications"}</span></div></section>
            {loading && applications.length === 0 ? <div className="admin-empty">Loading applications…</div> : applications.length === 0 ? (
              <div className="admin-empty"><BadgeCheck size={24} /><strong>No pending applications</strong><span>New pharmacy registrations will appear here.</span></div>
            ) : (
              <div className="application-list">
                {applications.map((pharmacy) => (
                  <article className="application-row" key={pharmacy.id}>
                    <div className="application-main">
                      <div className="application-title"><h2>{pharmacy.name}</h2><span>Pending review</span></div>
                      <p>{pharmacy.address}</p>
                      <dl>
                        <div><dt>Pharmacist</dt><dd>{pharmacy.pharmacist?.name ?? "Not provided"}</dd></div>
                        <div><dt>Email</dt><dd>{pharmacy.pharmacist?.email ?? "Not provided"}</dd></div>
                        <div><dt>Phone</dt><dd>{pharmacy.pharmacist?.phone ?? "Not provided"}</dd></div>
                        <div><dt>License</dt><dd>{pharmacy.license_number}</dd></div>
                        <div><dt>Coordinates</dt><dd>{pharmacy.latitude.toFixed(5)}, {pharmacy.longitude.toFixed(5)}</dd></div>
                        <div><dt>Submitted</dt><dd>{new Date(pharmacy.created_at).toLocaleString()}</dd></div>
                      </dl>
                    </div>
                    <button className="button button-primary application-verify" onClick={() => void verify(pharmacy)} disabled={verifyingId === pharmacy.id}>
                      <BadgeCheck size={16} />{verifyingId === pharmacy.id ? "Verifying…" : "Verify pharmacy"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}