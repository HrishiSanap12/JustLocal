import Constants from "expo-constants";
import { Platform } from "react-native";

export type User = { id: string; name: string; email: string; email_verified?: boolean; phone?: string | null; addresses: Address[]; family_members: FamilyMember[] };
export type Address = { id: string; label: string; address: string; phone?: string | null; default?: boolean };
export type FamilyMember = { id: string; name: string; relation: string; age?: number | null; allergies?: string | null };
export type Refill = { id: string; medicine_id: string; medicine_name: string; quantity: number; price: number; pharmacy_id?: string; pharmacy_name?: string; for_profile_id?: string | null; for_profile_name?: string | null; next_refill_at: string; status: string; last_order_id?: string };
export type SavedLocation = { id: string; label: string; address: string; latitude?: number; longitude?: number; savedAt: number };
export type Medicine = {
  id: string; name: string; pack: string; form: string; manufacturer: string; price: number | null; category: string;
  prescription_required: boolean; prescription_flag_inferred: boolean; availability: string; nearby_stores: number; composition: string;
  image_url: string | null; uses: string[]; side_effects: string[];
};
export type Category = { id: string; name: string; icon: string; group: string; count: number };
export type Pharmacy = { id: string; name: string; area: string; distance: string; distance_km?: number; latitude?: number; longitude?: number; accepting_requests?: boolean; eta: string; rating: number; reviews: string; threshold: number; status: string };
export type Offer = { id: string; title: string; subtitle: string; code: string; detail: string; accent: string };
export type CartItem = Medicine & { quantity: number };
export type OrderItem = { medicine_id?: string | null; name: string; quantity: number; price: number };
export type Order = {
  id: string; order_number: string; pharmacy_id?: string; pharmacy_name: string;
  items: OrderItem[]; address: string; total: number; status: string; created_at: string;
  eta: string; timeline: string[]; payment_status?: string;
};
export type MedicineRequestItem = { medicine_id?: string | null; requested_name?: string; name: string; pack: string; quantity: number; prescription_required: boolean; custom?: boolean };
export type PharmacyOfferItem = { medicine_id?: string | null; requested_name?: string | null; name: string; pack: string; quantity: number; unit_price: number; total: number };
export type PharmacyOffer = {
  id: string; pharmacy_id: string; pharmacy_name: string; area: string; distance_km?: number;
  availability: "available" | "partial" | "unavailable"; prescription_decision?: "matches" | "clarification" | "not-approved" | null;
  items: PharmacyOfferItem[]; subtotal: number; delivery_fee: number; total: number; eta_minutes: number;
  note?: string | null; status: string; created_at: string; expires_at: string;
};
export type MedicineRequest = {
  id: string; status: string; items: MedicineRequestItem[]; prescription_id?: string | null;
  matched_pharmacy_count: number; created_at: string; expires_at?: string; offers: PharmacyOffer[];
};
export type MedicineChatSource = {
  id: string;
  title: string;
  medicine?: string | null;
  field_type?: string | null;
  reviewed_by?: string | null;
  last_reviewed?: string | null;
  url?: string | null;
};
export type MedicineChatReply = {
  answer: string;
  sources: MedicineChatSource[];
  refused: boolean;
  emergency: boolean;
  disclaimer: string;
};
export type AuthSuccess = { token: string; user: User };
export type VerificationPending = { verification_required: true; email: string; dev_code?: string; code_expires_in_minutes?: number };
export type AuthResult = AuthSuccess | VerificationPending;
export function needsVerification(result: AuthResult): result is VerificationPending {
  return (result as VerificationPending).verification_required === true;
}
export type ExtractedMedicine = { name: string; strength?: string; frequency?: string; dosage?: string; duration?: string };
export type PrescriptionAnalysis = {
  prescription_id: string;
  provider: "none" | "tesseract" | "veryfi";
  status: "completed" | "failed" | "unavailable";
  message: string;
  ocr_text: string;
  medicines: ExtractedMedicine[];
};

export type RazorpayCheckout = {
  order_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  customer: { name?: string | null; email?: string | null; phone?: string | null };
};

const extra = Constants.expoConfig?.extra as { backendUrl?: string } | undefined;
export const API_URL = extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

type ApiRecord = Record<string, unknown>;

function asRecord(value: unknown): ApiRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as ApiRecord
    : null;
}

function stringField(record: ApiRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberField(record: ApiRecord, key: string, fallback = 0): number {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeCategories(payload: unknown): Category[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((value, index) => {
    const record = asRecord(value);
    const name = record && stringField(record, "name", "category_name");
    if (!record || !name) return [];
    return [{
      id: stringField(record, "id") ?? `category-${index}`,
      name,
      icon: stringField(record, "icon") ?? "medkit",
      group: stringField(record, "group") ?? "Other",
      count: numberField(record, "count"),
    }];
  });
}

function normalizeMedicines(payload: unknown): Medicine[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((value, index) => {
    const record = asRecord(value);
    const name = record && stringField(record, "name", "medicine_name");
    const category = record && stringField(record, "category", "category_name");
    if (!record || !name || !category) return [];
    return [{
      id: stringField(record, "id") ?? `medicine-${index}`,
      name,
      pack: stringField(record, "pack") ?? "",
      manufacturer: stringField(record, "manufacturer") ?? "",
      form: stringField(record, "form") ?? stringField(record, "pack") ?? "",
      price: typeof record.price === "number" && Number.isFinite(record.price) ? record.price : null,
      category,
      prescription_required: record.prescription_required === true,
      prescription_flag_inferred: record.prescription_flag_source === "inferred",
      image_url: stringField(record, "image_url") ?? null,
      uses: Array.isArray(record.uses) ? record.uses.filter((item): item is string => typeof item === "string") : [],
      side_effects: Array.isArray(record.side_effects) ? record.side_effects.filter((item): item is string => typeof item === "string") : [],
      availability: stringField(record, "availability") ?? "In stock",
      nearby_stores: numberField(record, "nearby_stores"),
      composition: stringField(record, "composition") ?? "",
    }];
  });
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? "Something went wrong. Please try again.");
  return payload as T;
}

export const api = {
  login: (identifier: string, password: string) => request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
  register: (name: string, email: string, phone: string, password: string) => request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, phone, password }) }),
  verifyEmail: (email: string, code: string) => request<AuthSuccess>("/auth/verify-email", { method: "POST", body: JSON.stringify({ email, code }) }),
  resendCode: (email: string) => request<{ ok: boolean; dev_code?: string }>("/auth/resend-code", { method: "POST", body: JSON.stringify({ email }) }),
  ocrConfig: () => request<{ provider: "none" | "tesseract" | "veryfi"; external: boolean }>("/prescriptions/ocr-config"),
  apple: (identity_token: string, name?: string, email?: string) => request<{ token: string; user: User }>("/auth/apple", { method: "POST", body: JSON.stringify({ identity_token, name, email }) }),
  exchangeSession: (session_id: string) => request<{ session_token: string; user: User }>("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  logout: (token: string) => request<{ ok: boolean }>("/auth/logout", { method: "POST" }, token).catch(() => ({ ok: true })),
  me: (token: string) => request<User>("/me", {}, token),
  categories: async () => normalizeCategories(await request<unknown>("/categories")),
  medicines: async (category?: string, search?: string, limit = 40) => normalizeMedicines(await request<unknown>(`/medicines?${new URLSearchParams({ ...(category ? { category } : {}), ...(search ? { search } : {}), limit: String(limit) }).toString()}`)),
  medicine: async (id: string) => normalizeMedicines([await request<unknown>(`/medicines/${encodeURIComponent(id)}`)])[0] ?? null,
  pharmacies: (latitude?: number, longitude?: number) => request<Pharmacy[]>(`/pharmacies${latitude !== undefined && longitude !== undefined ? `?${new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) })}` : ""}`),
  offers: () => request<Offer[]>("/offers"),
  orders: (token: string) => request<Order[]>("/orders", {}, token),
  medicineRequests: (token: string) => request<MedicineRequest[]>("/medicine-requests", {}, token),
  createMedicineRequest: (token: string, body: object) => request<MedicineRequest>("/medicine-requests", { method: "POST", body: JSON.stringify(body) }, token),
  revokeMedicineRequest: (token: string, requestId: string) => request<{ id: string; status: string }>(`/medicine-requests/${requestId}`, { method: "DELETE" }, token),
  askMedicineQuestion: (token: string, question: string) => request<MedicineChatReply>("/chat", { method: "POST", body: JSON.stringify({ question }) }, token),
  selectMedicineOffer: (token: string, requestId: string, offerId: string, payment_method: "cod" | "razorpay" = "cod") => request<Order>(`/medicine-requests/${requestId}/select-offer`, { method: "POST", body: JSON.stringify({ offer_id: offerId, payment_method }) }, token),
  createOrder: (token: string, body: object) => request<Order>("/orders", { method: "POST", body: JSON.stringify(body) }, token),
  addAddress: (token: string, body: object) => request<Address>("/addresses", { method: "POST", body: JSON.stringify(body) }, token),
  listFamily: (token: string) => request<FamilyMember[]>("/family", {}, token),
  addFamily: (token: string, body: object) => request<FamilyMember>("/family", { method: "POST", body: JSON.stringify(body) }, token),
  removeFamily: (token: string, memberId: string) => request<{ ok: boolean }>(`/family/${memberId}`, { method: "DELETE" }, token),
  listRefills: (token: string) => request<Refill[]>("/refills", {}, token),
  reorderRefill: (token: string, refillId: string, body: object) => request<Order>(`/refills/${refillId}/reorder`, { method: "POST", body: JSON.stringify(body) }, token),
  razorpayConfig: () => request<{ ready: boolean; key_id: string }>("/payments/razorpay/config"),
  razorpayOrder: (token: string, order_id: string) => request<RazorpayCheckout>("/payments/razorpay/order", { method: "POST", body: JSON.stringify({ order_id }) }, token),
  razorpayVerify: (token: string, body: object) => request<{ ok: boolean; status: string }>("/payments/razorpay/verify", { method: "POST", body: JSON.stringify(body) }, token),
  uploadPrescription: async (token: string, uri: string, name: string, mimeType?: string | null) => {
    const form = new FormData();
    const filename = name || "prescription.jpg";
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("file", blob, filename);
    } else {
      form.append("file", { uri, type: mimeType || "image/jpeg", name: filename } as unknown as Blob);
    }
    // No Content-Type header: fetch sets the multipart boundary itself.
    const response = await fetch(`${API_URL}/api/prescriptions`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `Prescription upload failed (${response.status})`);
    return payload as { id: string; filename: string; status: string };
  },
  analyzePrescription: (token: string, prescriptionId: string, externalOcrConsent: boolean) =>
    request<PrescriptionAnalysis>(`/prescriptions/${prescriptionId}/analyze`, { method: "POST", body: JSON.stringify({ external_ocr_consent: externalOcrConsent }) }, token),
};
