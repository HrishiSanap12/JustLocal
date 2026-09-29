import { useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Store, X } from "lucide-react";

import { PharmacyRegistration } from "./api";

export function AuthDialog({ onClose, onLogin, onRegister }: {
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (details: PharmacyRegistration) => Promise<string>;
}) {
  const [mode, setMode] = useState<"login" | "register" | "pending">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", pharmacy_name: "", license_number: "", address: "", latitude: "", longitude: "" });

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(form.email, form.password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const message = await onRegister({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        pharmacy_name: form.pharmacy_name,
        license_number: form.license_number,
        address: form.address,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      setMode("pending");
      setError(message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="dialog-header">
          <div><span className="section-label-text">JUSTLOCAL PHARMACY</span><h2 id="auth-title">{mode === "pending" ? "Application received" : mode === "login" ? "Sign in to your pharmacy" : "Register your pharmacy"}</h2></div>
          <button className="icon-button quiet" aria-label="Close sign-in dialog" onClick={onClose}><X size={18} /></button>
        </div>
        {mode === "pending" ? (
          <div className="pending-state"><span className="pending-icon"><Store size={20} /></span><strong>Manual verification is required</strong><p>{error}</p><p>We’ll enable pharmacist access after the pharmacy license and details are reviewed.</p><button className="button button-primary" onClick={onClose}>Done <ArrowRight size={15} /></button></div>
        ) : mode === "login" ? (
          <form onSubmit={submitLogin} className="auth-form">
            <p className="dialog-intro">Sign in with the account for your verified pharmacy.</p>
            <label className="form-label">Email<input autoComplete="email" type="email" required value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
            <label className="form-label">Password<input autoComplete="current-password" type="password" required value={form.password} onChange={(event) => update("password", event.target.value)} /></label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="button button-primary auth-submit" disabled={busy}><LockKeyhole size={15} />{busy ? "Signing in…" : "Sign in"}</button>
            <button type="button" className="auth-switch" onClick={() => { setMode("register"); setError(""); }}>Register a pharmacy <ArrowRight size={14} /></button>
          </form>
        ) : (
          <form onSubmit={submitRegistration} className="auth-form register-form">
            <p className="dialog-intro">Pharmacy access starts after manual license verification.</p>
            <div className="register-grid">
              <label className="form-label">Pharmacist name<input required value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
              <label className="form-label">Pharmacy name<input required value={form.pharmacy_name} onChange={(event) => update("pharmacy_name", event.target.value)} /></label>
              <label className="form-label">Work email<input type="email" required value={form.email} onChange={(event) => update("email", event.target.value)} /></label>
              <label className="form-label">Phone<input type="tel" required value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label>
              <label className="form-label">Pharmacy license number<input required value={form.license_number} onChange={(event) => update("license_number", event.target.value)} /></label>
              <label className="form-label">Password (12+ characters)<input type="password" minLength={12} required value={form.password} onChange={(event) => update("password", event.target.value)} /></label>
              <label className="form-label wide-field">Pharmacy address<input required minLength={8} value={form.address} onChange={(event) => update("address", event.target.value)} /></label>
              <label className="form-label">Latitude<input type="number" min={-90} max={90} step="any" required value={form.latitude} onChange={(event) => update("latitude", event.target.value)} /></label>
              <label className="form-label">Longitude<input type="number" min={-180} max={180} step="any" required value={form.longitude} onChange={(event) => update("longitude", event.target.value)} /></label>
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <div className="dialog-actions auth-form-actions"><button type="button" className="button button-quiet" onClick={() => { setMode("login"); setError(""); }}><ArrowLeft size={14} />Back to sign in</button><button className="button button-primary" disabled={busy}>{busy ? "Submitting…" : "Submit for verification"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
