const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001/api").replace(/\/$/, "");

export type Pharmacist = {
  id: string;
  name: string;
  email: string;
  pharmacy_id: string;
  pharmacy_name: string;
  status: "verified";
};
export type PharmacyRegistration = { name: string; email: string; phone: string; password: string; pharmacy_name: string; license_number: string; address: string; latitude: number; longitude: number };

export type PharmacyProduct = {
  id: string;
  name: string;
  pack: string;
  manufacturer: string;
  price: number;
  category: string;
  prescription_required: boolean;
  composition?: string;
  carried: boolean;
  pharmacy_price: number | null;
  updated_at?: string;
};

export type PharmacyRequestItem = {
  medicine_id: string;
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
  distance_km: number;
  prescription_review?: { decision: "matches" | "clarification" | "not-approved"; reason?: string };
  offer?: { id: string; availability: string; total: number; status: string };
};

export type PharmacyOfferItem = { medicine_id: string; name: string; pack: string; quantity: number; unit_price: number; total: number };
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
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Request failed. Please try again.");
  return result as T;
}

export const pharmacistApi = {
  login: (email: string, password: string) => call<{ token: string; pharmacist: Pharmacist }>("/pharmacist/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (body: PharmacyRegistration) => call<{ pharmacy_id: string; status: string; message: string }>("/pharmacist/auth/register", undefined, { method: "POST", body: JSON.stringify(body) }),
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
  respond: (token: string, requestId: string, body: { availability: "available" | "partial" | "unavailable"; prescription_decision?: "matches" | "clarification" | "not-approved"; items?: { medicine_id: string; quantity: number }[]; eta_minutes?: number; note?: string }) => call<{ id: string; total: number; status: string }>(`/pharmacist/requests/${requestId}/offer`, token, { method: "POST", body: JSON.stringify(body) }),
  orders: (token: string) => call<PharmacyOrder[]>("/pharmacist/orders", token),
  updateOrder: (token: string, orderId: string, status: "Preparing" | "Out for Delivery" | "Delivered") => call<{ id: string; status: string }>(`/pharmacist/orders/${orderId}/status`, token, { method: "PATCH", body: JSON.stringify({ status }) }),
};

export function prescriptionImage(data: { content_type: string; data_base64: string }) {
  return `data:${data.content_type};base64,${data.data_base64}`;
}
