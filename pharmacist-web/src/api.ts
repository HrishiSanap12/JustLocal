const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001/api").replace(/\/$/, "");

export type Pharmacist = {
  id: string;
  name: string;
  email: string;
  pharmacy_id: string;
  pharmacy_name: string;
  status: "verified";
};
export type PendingPharmacy = {
  id: string;
  name: string;
  address: string;
  license_number: string;
  latitude: number;
  longitude: number;
  created_at: string;
  pharmacist?: { id: string; name: string; email: string; phone: string; email_verified?: boolean } | null;
};
export type PharmacyRegistration = { name: string; email: string; phone: string; password: string; pharmacy_name: string; license_number: string; address: string; latitude: number; longitude: number };

export type PharmacyProduct = {
  id: string;
  name: string;
  pack: string;
  manufacturer: string;
  price: number | null;
  category: string;
  prescription_required: boolean;
  composition?: string;
  form?: string;
  image_url?: string | null;
  carried: boolean;
  pharmacy_price: number | null;
  updated_at?: string;
};

export type PharmacyRequestItem = {
  medicine_id: string | null;
  requested_name?: string | null;
  custom?: boolean;
  name: string;
  pack: string;
  quantity: number;
  prescription_required: boolean;
};

export type PharmacyRequest = {
  id: string;
  patient_name: string;
  items: PharmacyRequestItem[];
  prescription_id?: string | null;
  prescription_share_consent: boolean;
  status: string;
  expires_at: string;
  created_at: string;
  matched_pharmacy_count: number;
  assignment_id: string;
  assignment_status: string;
  distance_km: number | null;
  prescription_review?: { decision: "matches" | "clarification" | "not-approved"; reason?: string };
  offer?: { id: string; availability: string; total: number; status: string };
};

export type OfferLine = { medicine_id: string; quantity: number } | { requested_name: string; unit_price: number; quantity: number };
export type RegistrationResult = { pharmacy_id: string; status: string; message: string; verification_required?: boolean; email?: string; dev_code?: string; email_send_failed?: boolean };

export type PharmacyOfferItem = { medicine_id: string | null; name: string; pack: string; quantity: number; unit_price: number; total: number };
export type PharmacyOrder = {
  id: string;
  order_number: string;
  request_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  items: { medicine_id: string; name: string; quantity: number; price: number }[];
  address: string;
  total: number;
  status: string;
  created_at: string;
  eta: string;
  timeline: string[];
};

async function call<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof result.detail === "string" ? result.detail : "Request failed. Please try again.");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result as T;
}

async function adminCall<T>(path: string, adminToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Pharmacy-Admin-Token", adminToken);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof result.detail === "string" ? result.detail : "Request failed. Please try again.");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return result as T;
}

export const pharmacistApi = {
  login: (email: string, password: string) => call<{ token: string; pharmacist: Pharmacist }>("/pharmacist/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (body: PharmacyRegistration) => call<RegistrationResult>("/pharmacist/auth/register", undefined, { method: "POST", body: JSON.stringify(body) }),
  verifyEmail: (email: string, code: string) => call<{ email_verified: boolean; status: string; message?: string }>("/pharmacist/auth/verify-email", undefined, { method: "POST", body: JSON.stringify({ email, code }) }),
  resendCode: (email: string) => call<{ ok: boolean; dev_code?: string }>("/pharmacist/auth/resend-code", undefined, { method: "POST", body: JSON.stringify({ email }) }),
  me: (token: string) => call<Pharmacist & { area: string; accepting_requests: boolean }>("/pharmacist/me", token),
  logout: (token: string) => call<{ ok: boolean }>("/pharmacist/auth/logout", token, { method: "POST" }),
  setAvailability: (token: string, accepting_requests: boolean) => call<{ accepting_requests: boolean }>("/pharmacist/availability", token, { method: "PATCH", body: JSON.stringify({ accepting_requests }) }),
  catalog: (token: string, search = "") => call<PharmacyProduct[]>(`/pharmacist/catalog${search ? `?search=${encodeURIComponent(search)}` : ""}`, token),
  carryList: (token: string) => call<PharmacyProduct[]>("/pharmacist/carry-list", token),
  saveCarry: (token: string, medicine_id: string, price: number, carried = true) => call<PharmacyProduct>("/pharmacist/carry-list", token, { method: "POST", body: JSON.stringify({ medicine_id, price, carried }) }),
  updateCarry: (token: string, medicine_id: string, update: { price?: number; carried?: boolean }) => call<{ medicine_id: string; price?: number; carried?: boolean }>(`/pharmacist/carry-list/${encodeURIComponent(medicine_id)}`, token, { method: "PATCH", body: JSON.stringify(update) }),
  requests: (token: string) => call<PharmacyRequest[]>("/pharmacist/requests", token),
  prescription: (token: string, requestId: string) => call<{ filename: string; content_type: string; data_base64: string }>(`/pharmacist/requests/${requestId}/prescription`, token),
  reviewPrescription: (token: string, requestId: string, decision: "matches" | "clarification" | "not-approved", reason?: string) => call<{ decision: string }>(`/pharmacist/requests/${requestId}/prescription-review`, token, { method: "POST", body: JSON.stringify({ decision, reason }) }),
  respond: (token: string, requestId: string, body: { availability: "available" | "partial" | "unavailable"; prescription_decision?: "matches" | "clarification" | "not-approved"; items?: OfferLine[]; eta_minutes?: number; note?: string }) => call<{ id: string; total: number; status: string }>(`/pharmacist/requests/${requestId}/offer`, token, { method: "POST", body: JSON.stringify(body) }),
  orders: (token: string) => call<PharmacyOrder[]>("/pharmacist/orders", token),
  updateOrder: (token: string, orderId: string, status: "Preparing" | "Out for Delivery" | "Delivered") => call<{ id: string; status: string }>(`/pharmacist/orders/${orderId}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) }),
};

export type DailyPoint = { date: string; requests: number; orders: number; signups: number };
export type EndpointStat = { route: string; calls: number; p50_ms: number | null; p95_ms: number | null; error_rate: number };
export type AdminMetrics = {
  generated_at: string;
  window_days: number;
  users: { total: number; email_verified: number; new_7d: number; new_30d: number; active_7d: number; ordering_customers: number; sign_in_methods: Record<string, number> };
  pharmacies: { total: number; verified: number; pending: number; rejected: number; suspended: number; accepting: number };
  requests: { total: number; last_7d: number; by_status: Record<string, number>; with_prescription: number; with_offers: number; avg_pharmacies_matched: number; response_rate: number | null; median_first_offer_minutes: number | null; p90_first_offer_minutes: number | null };
  offers: { total: number; available: number; partial: number; unavailable: number; selected: number };
  orders: { total: number; by_status: Record<string, number>; gross_value: number; avg_order_value: number; conversion_rate: number | null; delivered: number };
  daily: DailyPoint[];
  top_medicines: { name: string; quantity: number }[];
  top_pharmacies: { id: string; name: string; orders: number; value: number; offers: number }[];
  system: {
    uptime_seconds: number; requests_24h: number; p50_ms: number | null; p95_ms: number | null; p99_ms: number | null;
    server_error_rate: number; client_error_rate: number; db_ping_ms: number | null; email_provider: string; email_dev_mode: boolean;
    ocr_provider: string; catalog_size: number; endpoints: EndpointStat[]; latency_by_hour: { hour: number; calls: number; p95_ms: number | null }[];
  };
};
export type AdminPharmacy = {
  id: string; name: string; address?: string; area?: string; license_number?: string; latitude?: number; longitude?: number;
  verification_status: string; accepting_requests?: boolean; created_at?: string; moderation_reason?: string | null;
  orders: number; carried_medicines: number;
  pharmacist?: { id: string; name: string; email: string; phone: string; status: string; email_verified: boolean } | null;
};

function adminPost<T>(path: string, token: string, body?: object) {
  return adminCall<T>(path, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

export const pharmacyAdminApi = {
  pending: (token: string) => adminCall<PendingPharmacy[]>("/admin/pharmacies/pending", token),
  verify: (token: string, pharmacyId: string) => adminCall<{ pharmacy_id: string; status: string }>(`/admin/pharmacies/${encodeURIComponent(pharmacyId)}/verify`, token, { method: "POST" }),
  metrics: (token: string, days = 14) => adminCall<AdminMetrics>(`/admin/metrics?days=${days}`, token),
  pharmacies: (token: string) => adminCall<AdminPharmacy[]>("/admin/pharmacies", token),
  reject: (token: string, pharmacyId: string, reason: string) => adminPost<{ status: string }>(`/admin/pharmacies/${encodeURIComponent(pharmacyId)}/reject`, token, { reason }),
  suspend: (token: string, pharmacyId: string, reason: string) => adminPost<{ status: string }>(`/admin/pharmacies/${encodeURIComponent(pharmacyId)}/suspend`, token, { reason }),
  reinstate: (token: string, pharmacyId: string) => adminPost<{ status: string }>(`/admin/pharmacies/${encodeURIComponent(pharmacyId)}/reinstate`, token),
};

export function prescriptionImage(data: { content_type: string; data_base64: string }) {
  return `data:${data.content_type};base64,${data.data_base64}`;
}
