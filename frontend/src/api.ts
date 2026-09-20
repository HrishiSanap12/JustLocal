import Constants from "expo-constants";

export type User = { id: string; name: string; email: string; phone?: string | null; addresses: Address[] };
export type Address = { id: string; label: string; address: string; phone?: string | null; default?: boolean };
export type Medicine = { id: string; name: string; pack: string; manufacturer: string; price: number; category: string; prescription_required: boolean; availability: string; nearby_stores: number; composition: string };
export type Category = { id: string; name: string; icon: string; group: string; count: number };
export type Pharmacy = { id: string; name: string; area: string; distance: string; eta: string; rating: number; reviews: string; threshold: number; status: string };
export type Offer = { id: string; title: string; subtitle: string; code: string; detail: string; accent: string };
export type CartItem = Medicine & { quantity: number };
export type OrderItem = { medicine_id: string; name: string; quantity: number; price: number };
export type Order = {
  id: string; order_number: string; pharmacy_id?: string; pharmacy_name: string;
  items: OrderItem[]; address: string; total: number; status: string; created_at: string;
  eta: string; timeline: string[]; payment_status?: string;
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
  login: (identifier: string, password: string) => request<{ token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }),
  register: (name: string, email: string, phone: string, password: string) => request<{ token: string; user: User }>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, phone, password }) }),
  apple: (identity_token: string, name?: string, email?: string) => request<{ token: string; user: User }>("/auth/apple", { method: "POST", body: JSON.stringify({ identity_token, name, email }) }),
  exchangeSession: (session_id: string) => request<{ session_token: string; user: User }>("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  logout: (token: string) => request<{ ok: boolean }>("/auth/logout", { method: "POST" }, token).catch(() => ({ ok: true })),
  me: (token: string) => request<User>("/me", {}, token),
  categories: () => request<Category[]>("/categories"),
  medicines: (category?: string, search?: string) => request<Medicine[]>(`/medicines?${new URLSearchParams({ ...(category ? { category } : {}), ...(search ? { search } : {}) }).toString()}`),
  pharmacies: () => request<Pharmacy[]>("/pharmacies"),
  offers: () => request<Offer[]>("/offers"),
  orders: (token: string) => request<Order[]>("/orders", {}, token),
  createOrder: (token: string, body: object) => request<Order>("/orders", { method: "POST", body: JSON.stringify(body) }, token),
  addAddress: (token: string, body: object) => request<Address>("/addresses", { method: "POST", body: JSON.stringify(body) }, token),
  razorpayConfig: () => request<{ ready: boolean; key_id: string }>("/payments/razorpay/config"),
  razorpayOrder: (token: string, order_id: string) => request<RazorpayCheckout>("/payments/razorpay/order", { method: "POST", body: JSON.stringify({ order_id }) }, token),
  razorpayVerify: (token: string, body: object) => request<{ ok: boolean; status: string }>("/payments/razorpay/verify", { method: "POST", body: JSON.stringify(body) }, token),
  uploadPrescription: async (token: string, uri: string, name: string) => {
    const form = new FormData();
    form.append("file", { uri, type: "image/jpeg", name } as unknown as Blob);
    const response = await fetch(`${API_URL}/api/prescriptions`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail ?? "Prescription upload failed");
    return payload as { id: string; filename: string; status: string };
  },
};
