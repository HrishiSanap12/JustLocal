import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileImage,
  HeartPulse,
  LayoutDashboard,
  MapPin,
  Menu,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  Store,
  X,
} from "lucide-react";
import { AuthDialog } from "./AuthDialog";
import { pharmacistApi, PharmacyOrder, PharmacyProduct, PharmacyRegistration, PharmacyRequest, prescriptionImage } from "./api";

type Page = "requests" | "catalog" | "orders";
type RequestStatus = "new" | "reviewing" | "offer sent" | "declined";
type PrescriptionDecision = "matches" | "clarification" | "not-approved" | null;

type RequestedMedicine = {
  id: string;
  name: string;
  strength: string;
  form: string;
  quantity: number;
  unit: string;
  quotePrice: number;
};

type MedicineRequest = {
  id: string;
  patient: string;
  initials: string;
  area: string;
  distance: string;
  received: string;
  deadline: string;
  prescription: boolean;
  prescriptionDecision: PrescriptionDecision;
  status: RequestStatus;
  prescriptionOnly?: boolean;
  medicines: RequestedMedicine[];
};

type CatalogMedicine = {
  id: string;
  name: string;
  strength: string;
  form: string;
  manufacturer: string;
  price: number;
  carried: boolean;
};

const initialRequests: MedicineRequest[] = [
  {
    id: "JL-4821",
    patient: "Ananya R.",
    initials: "AR",
    area: "Indiranagar, Bengaluru",
    distance: "1.4 km",
    received: "4 min ago",
    deadline: "Respond in 11 min",
    prescription: true,
    prescriptionDecision: null,
    status: "new",
    medicines: [
      { id: "med-1", name: "Amoxicillin", strength: "500 mg", form: "Capsule", quantity: 2, unit: "strip", quotePrice: 86 },
      { id: "med-2", name: "Pantoprazole", strength: "40 mg", form: "Tablet", quantity: 1, unit: "strip", quotePrice: 74 },
    ],
  },
  {
    id: "JL-4818",
    patient: "Rahul M.",
    initials: "RM",
    area: "Domlur, Bengaluru",
    distance: "2.1 km",
    received: "12 min ago",
    deadline: "Respond in 6 min",
    prescription: false,
    prescriptionDecision: null,
    status: "reviewing",
    medicines: [
      { id: "med-3", name: "Paracetamol", strength: "650 mg", form: "Tablet", quantity: 1, unit: "strip", quotePrice: 32 },
    ],
  },
  {
    id: "JL-4812",
    patient: "Meera S.",
    initials: "MS",
    area: "HAL 2nd Stage, Bengaluru",
    distance: "2.8 km",
    received: "26 min ago",
    deadline: "Offer sent",
    prescription: true,
    prescriptionDecision: "matches",
    status: "offer sent",
    medicines: [
      { id: "med-4", name: "Cetirizine", strength: "10 mg", form: "Tablet", quantity: 1, unit: "strip", quotePrice: 42 },
      { id: "med-5", name: "Vitamin D3", strength: "60,000 IU", form: "Capsule", quantity: 1, unit: "pack", quotePrice: 120 },
    ],
  },
];

const initialCatalog: CatalogMedicine[] = [
  { id: "med-1", name: "Amoxicillin", strength: "500 mg", form: "Capsule · 10s", manufacturer: "Alkem", price: 86, carried: true },
  { id: "med-2", name: "Pantoprazole", strength: "40 mg", form: "Tablet · 10s", manufacturer: "Sun Pharma", price: 74, carried: true },
  { id: "med-3", name: "Paracetamol", strength: "650 mg", form: "Tablet · 15s", manufacturer: "Cipla", price: 32, carried: true },
  { id: "med-4", name: "Cetirizine", strength: "10 mg", form: "Tablet · 10s", manufacturer: "Dr. Reddy's", price: 42, carried: true },
  { id: "med-5", name: "Vitamin D3", strength: "60,000 IU", form: "Capsule · 4s", manufacturer: "Uprise", price: 120, carried: true },
  { id: "med-6", name: "ORS powder", strength: "21.8 g", form: "Sachet", manufacturer: "Electral", price: 22, carried: false },
  { id: "med-7", name: "Mupirocin", strength: "2%", form: "Ointment · 5 g", manufacturer: "T-Bact", price: 98, carried: false },
];

const initialOrders = [
  { id: "JL-4790", patient: "Ishaan K.", area: "Koramangala", items: "2 medicines", total: 168, status: "Preparing", placed: "Today, 10:42 am" },
  { id: "JL-4776", patient: "Priya N.", area: "Indiranagar", items: "1 medicine", total: 42, status: "Ready for pickup", placed: "Today, 9:18 am" },
];

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

function mapRequest(request: PharmacyRequest, catalog: PharmacyProduct[]): MedicineRequest {
  const carried = new Map(catalog.map((medicine) => [medicine.id, medicine]));
  const assignmentState: Record<string, RequestStatus> = {
    invited: "new",
    reviewing: "reviewing",
    offered: "offer sent",
    unavailable: "declined",
    needs_clarification: "reviewing",
    not_approved: "reviewing",
  };
  const patient = request.patient_name || "Customer";
  const names = patient.split(/\s+/);
  const initials = `${names[0]?.[0] ?? "C"}${names.length > 1 ? names.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
  const minutesLeft = Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - Date.now()) / 60000));
  return {
    id: request.id,
    patient,
    initials,
    area: "Delivery details shared after offer selection",
    distance: `${request.distance_km.toFixed(1)} km`,
    received: timeAgo(request.created_at),
    deadline: request.offer ? "Offer sent" : minutesLeft ? `Respond in ${minutesLeft} min` : "Request expired",
    prescription: Boolean(request.prescription_id),
    prescriptionDecision: request.prescription_review?.decision ?? null,
    status: assignmentState[request.assignment_status] ?? "new",
    prescriptionOnly: Boolean(request.prescription_id) && request.items.length === 0,
    medicines: request.items.map((item) => {
      const product = carried.get(item.medicine_id);
      const match = item.name.match(/\b(\d+(?:\.\d+)?\s?(?:mg|mcg|ml|iu|g|%))\b/i);
      return {
        id: item.medicine_id,
        name: item.name,
        strength: match?.[1] ?? "",
        form: item.pack || "Pack",
        quantity: item.quantity,
        unit: "pack",
        quotePrice: product?.pharmacy_price ?? product?.price ?? 0,
      };
    }),
  };
}

function mapProduct(product: PharmacyProduct): CatalogMedicine {
  const match = product.name.match(/\b(\d+(?:\.\d+)?\s?(?:mg|mcg|ml|iu|g|%))\b/i);
  return {
    id: product.id,
    name: product.name,
    strength: match?.[1] ?? "",
    form: product.pack || "Pack",
    manufacturer: product.manufacturer,
    price: product.pharmacy_price ?? product.price,
    carried: product.carried,
  };
}

function mapOrder(order: PharmacyOrder) {
  return {
    id: order.order_number,
    orderId: order.id,
    patient: "Customer",
    area: order.address,
    items: order.items.map((item) => `${item.name} ×${item.quantity}`).join(", "),
    total: order.total,
    status: order.status,
    placed: timeAgo(order.created_at),
  };
}

type WorkspaceOrder = Omit<ReturnType<typeof mapOrder>, "orderId"> & { orderId?: string };

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "requests", label: "Requests", icon: LayoutDashboard },
  { id: "catalog", label: "Medicines we carry", icon: BookOpenCheck },
  { id: "orders", label: "Orders", icon: PackageCheck },
];

function App() {
  const [page, setPage] = useState<Page>("requests");
  const [requests, setRequests] = useState(initialRequests);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [orders, setOrders] = useState<WorkspaceOrder[]>(initialOrders.map((order) => ({ ...order, orderId: undefined })));
  const [selectedId, setSelectedId] = useState(initialRequests[0].id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All requests");
  const [isAvailable, setIsAvailable] = useState(true);
  const [isPrescriptionOpen, setPrescriptionOpen] = useState(false);
  const [isAddMedicineOpen, setAddMedicineOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [pharmacist, setPharmacist] = useState<{ name: string; email: string; pharmacy_id: string; pharmacy_name: string; area: string } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState<{ content_type: string; data_base64: string } | null>(null);
  const isDemo = liveToken === null;

  const selectedRequest = requests.find((request) => request.id === selectedId) ?? (isDemo ? requests[0] : null) ?? null;
  const filteredRequests = useMemo(() => {
    const term = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesQuery = !term || [request.id, request.patient, request.area, ...request.medicines.map((medicine) => medicine.name)].join(" ").toLowerCase().includes(term);
      const matchesFilter = filter === "All requests" || (filter === "Needs response" && ["new", "reviewing"].includes(request.status)) || (filter === "Offer sent" && request.status === "offer sent");
      return matchesQuery && matchesFilter;
    });
  }, [filter, query, requests]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function refreshLiveData(token: string) {
    const [profile, apiRequests, apiCatalog, apiOrders] = await Promise.all([
      pharmacistApi.me(token),
      pharmacistApi.requests(token),
      pharmacistApi.catalog(token),
      pharmacistApi.orders(token),
    ]);
    const nextCatalog = apiCatalog.map(mapProduct);
    const nextRequests = apiRequests.map((request) => mapRequest(request, apiCatalog));
    setPharmacist({ name: profile.name, email: profile.email, pharmacy_id: profile.pharmacy_id, pharmacy_name: profile.pharmacy_name, area: profile.area });
    setRequests(nextRequests);
    setCatalog(nextCatalog);
    setOrders(apiOrders.map(mapOrder));
    setIsAvailable(profile.accepting_requests);
    setSelectedId((current) => nextRequests.some((request) => request.id === current) ? current : nextRequests[0]?.id ?? "");
  }

  useEffect(() => {
    if (!liveToken) return;
    let active = true;
    const refresh = async () => {
      if (!active) return;
      try {
        await refreshLiveData(liveToken);
      } catch (error) {
        if (active) notify(error instanceof Error ? error.message : "Couldn't refresh pharmacy data.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => { if (page === "requests") void refresh(); }, 6000);
    return () => { active = false; window.clearInterval(interval); };
  }, [liveToken, page]);

  async function signIn(email: string, password: string) {
    const result = await pharmacistApi.login(email, password);
    setLiveToken(result.token);
    setPharmacist({ ...result.pharmacist, area: "" });
    setAuthOpen(false);
    setQuery("");
    try {
      await refreshLiveData(result.token);
      notify(`Connected to ${result.pharmacist.pharmacy_name}.`);
    } catch (error) {
      setLiveToken(null);
      throw error;
    }
  }

  async function registerPharmacy(details: PharmacyRegistration) {
    const result = await pharmacistApi.register(details);
    return result.message;
  }

  async function signOut() {
    if (liveToken) await pharmacistApi.logout(liveToken).catch(() => undefined);
    setLiveToken(null);
    setPharmacist(null);
    setRequests(initialRequests);
    setCatalog(initialCatalog);
    setOrders(initialOrders.map((order) => ({ ...order, orderId: undefined })));
    setSelectedId(initialRequests[0].id);
    notify("Signed out of the pharmacy workspace.");
  }

  async function toggleAvailability() {
    const next = !isAvailable;
    if (liveToken) {
      try {
        const result = await pharmacistApi.setAvailability(liveToken, next);
        setIsAvailable(result.accepting_requests);
        notify(result.accepting_requests ? "Your pharmacy is accepting requests." : "New requests are paused.");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Couldn't update availability.");
      }
      return;
    }
    setIsAvailable(next);
    notify(next ? "Your pharmacy is accepting requests in this demo." : "New requests paused in this demo.");
  }

  async function openPrescriptionReview() {
    if (!selectedRequest) return;
    if (liveToken && selectedRequest.prescription) {
      try {
        const prescription = await pharmacistApi.prescription(liveToken, selectedRequest.id);
        setPrescriptionData(prescription);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Couldn't open prescription.");
        return;
      }
    }
    setPrescriptionOpen(true);
  }

  async function toggleCarried(medicineId: string) {
    const medicine = catalog.find((item) => item.id === medicineId);
    if (!medicine) return;
    if (liveToken) {
      try {
        await pharmacistApi.updateCarry(liveToken, medicineId, { carried: !medicine.carried });
        setCatalog((current) => current.map((item) => item.id === medicineId ? { ...item, carried: !item.carried } : item));
      } catch (error) {
        notify(error instanceof Error ? error.message : "Couldn't update carry list.");
      }
      return;
    }
    setCatalog((current) => current.map((item) => item.id === medicineId ? { ...item, carried: !item.carried } : item));
  }

  async function persistPrice(medicineId: string, price: number) {
    if (!liveToken) return;
    try {
      await pharmacistApi.updateCarry(liveToken, medicineId, { price });
      notify("Pharmacy price saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't save pharmacy price.");
      await refreshLiveData(liveToken).catch(() => undefined);
    }
  }

  function updateRequest(requestId: string, patch: Partial<MedicineRequest>) {
    setRequests((current) => current.map((request) => request.id === requestId ? { ...request, ...patch } : request));
  }

  async function savePrescriptionDecision(decision: Exclude<PrescriptionDecision, null>) {
    if (!selectedRequest) return;
    try {
      if (liveToken) await pharmacistApi.reviewPrescription(liveToken, selectedRequest.id, decision);
      updateRequest(selectedRequest.id, { prescriptionDecision: decision, status: selectedRequest.status === "new" ? "reviewing" : selectedRequest.status });
      setPrescriptionOpen(false);
      setPrescriptionData(null);
      notify(liveToken ? "Prescription decision recorded." : "Decision recorded in this demo.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't record the prescription decision.");
    }
  }

  async function sendOffer() {
    if (!selectedRequest) return;
    if (selectedRequest.prescription && selectedRequest.prescriptionDecision !== "matches") {
      notify("Confirm that the prescription matches before sending an offer.");
      return;
    }
    if (selectedRequest.medicines.length === 0) {
      notify("Add the prescribed medicine from your carry list before sending an offer.");
      return;
    }
    try {
      if (liveToken) {
        await pharmacistApi.respond(liveToken, selectedRequest.id, {
          availability: "available",
          prescription_decision: selectedRequest.prescription ? selectedRequest.prescriptionDecision ?? undefined : undefined,
          items: selectedRequest.medicines.map((medicine) => ({ medicine_id: medicine.id, quantity: medicine.quantity })),
          eta_minutes: 30,
        });
        await refreshLiveData(liveToken);
        notify(`Offer sent for ${selectedRequest.id}.`);
      } else {
        updateRequest(selectedRequest.id, { status: "offer sent" });
        notify(`Offer sent for ${selectedRequest.id} in this demo.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't send the offer.");
    }
  }

  async function declineRequest() {
    if (!selectedRequest) return;
    try {
      if (liveToken) {
        await pharmacistApi.respond(liveToken, selectedRequest.id, {
          availability: "unavailable",
          prescription_decision: selectedRequest.prescription ? selectedRequest.prescriptionDecision ?? undefined : undefined,
          items: [],
        });
        await refreshLiveData(liveToken);
        notify(`Request ${selectedRequest.id} declined.`);
      } else {
        updateRequest(selectedRequest.id, { status: "declined" });
        notify(`Request ${selectedRequest.id} declined in this demo.`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't decline this request.");
    }
  }

  function updatePrice(medicineId: string, value: string) {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return;
    setCatalog((current) => current.map((medicine) => medicine.id === medicineId ? { ...medicine, price } : medicine));
  }

  function addOfferMedicine(requestId: string, medicineId: string, quantity: number) {
    const medicine = catalog.find((item) => item.id === medicineId && item.carried);
    if (!medicine || quantity < 1) return;
    setRequests((current) => current.map((request) => {
      if (request.id !== requestId || request.medicines.some((item) => item.id === medicineId)) return request;
      return {
        ...request,
        prescriptionOnly: false,
        medicines: [...request.medicines, { id: medicine.id, name: medicine.name, strength: medicine.strength, form: medicine.form, quantity, unit: "pack", quotePrice: medicine.price }],
      };
    }));
  }

  async function advanceOrder(order: WorkspaceOrder) {
    const nextStatus = order.status === "Pharmacy Confirmed" ? "Preparing" : order.status === "Preparing" ? "Out for Delivery" : order.status === "Out for Delivery" ? "Delivered" : null;
    if (!nextStatus) return;
    if (liveToken && order.orderId) {
      try {
        await pharmacistApi.updateOrder(liveToken, order.orderId, nextStatus);
        await refreshLiveData(liveToken);
        notify(`${order.id} updated to ${nextStatus}.`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Couldn't update order.");
      }
      return;
    }
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item));
    notify(`${order.id} updated in this demo.`);
  }

  const title = page === "requests" ? "Customer requests" : page === "catalog" ? "Medicines we carry" : "Orders";
  const subtitle = page === "requests"
    ? "Review each request, check the prescription when needed, and send your offer."
    : page === "catalog"
      ? "Keep your pharmacy's medicine list and prices up to date. No stock counts."
      : "Orders appear here after a customer chooses your offer.";

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand-lockup" href="#home" onClick={(event) => { event.preventDefault(); setPage("requests"); }} aria-label="Justlocal pharmacy home">
          <span className="capsule-mark"><span /><i>+</i></span>
          <span className="brand-name">Just<span>local</span></span>
        </a>
        <div className="workspace-label">PHARMACY WORKSPACE</div>
        <div className="pharmacy-switcher">
          <div className="store-avatar"><Store size={17} /></div>
          <div className="pharmacy-switcher-copy"><strong>{pharmacist?.pharmacy_name ?? "Namma Care Pharmacy"}</strong><span>{pharmacist?.area || "Sample pharmacy · Bengaluru"}</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <nav className="primary-nav" aria-label="Main navigation">
          <span className="nav-caption">WORKSPACE</span>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button className={`nav-link ${page === id ? "active" : ""}`} key={id} onClick={() => { setPage(id); setQuery(""); }}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {id === "requests" && <span className="nav-count">{requests.filter((request) => ["new", "reviewing"].includes(request.status)).length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="support-link"><CircleHelp size={17} /><span>Help & support</span><ArrowUpRightIcon /></div>
          <div className="profile-block">
            <div className="profile-avatar">{pharmacist?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "RK"}</div>
            <div className="profile-copy"><strong>{pharmacist?.name ?? "Sample pharmacist"}</strong><span>{isDemo ? "Preview mode" : pharmacist?.email}</span></div>
            <button className="icon-button quiet" aria-label={isDemo ? "Sign in" : "Sign out"} onClick={() => isDemo ? setAuthOpen(true) : void signOut()}>{isDemo ? <ChevronDown size={16} /> : <X size={16} />}</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand"><span className="capsule-mark"><span /><i>+</i></span><span className="brand-name">Just<span>local</span></span></div>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div>
          <div className="topbar-actions">
            <div className="branch-state"><span className="state-dot" /><span>{pharmacist?.area || "Indiranagar branch"}</span></div>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => notify("You're all caught up in this demo.")}><Bell size={18} /><i /></button>
            <button className="top-profile" aria-label={isDemo ? "Connect pharmacy account" : "Sign out"} onClick={() => isDemo ? setAuthOpen(true) : void signOut()}><span className="profile-avatar small">{pharmacist?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "RK"}</span>{isDemo ? <ChevronDown size={15} /> : <X size={15} />}</button>
          </div>
        </header>

        <div className="page-content">
          <div className={`demo-banner ${isDemo ? "" : "live-banner"}`}><span className="demo-dot" /><strong>{isDemo ? "DEMO WORKSPACE" : "LIVE PHARMACY"}</strong><span>{isDemo ? "Sample data only. Changes stay in this browser and are not sent to a pharmacy." : `Connected to ${pharmacist?.pharmacy_name ?? "your verified pharmacy"}.`}</span>{isDemo && <button className="banner-action" onClick={() => setAuthOpen(true)}>Connect account <ArrowRight size={13} /></button>}</div>
          <div className="page-heading">
            <div><div className="eyebrow">WEDNESDAY, 30 SEPTEMBER</div><h1>{title}</h1><p>{subtitle}</p></div>
            {page === "requests" && <button className={`availability-toggle ${isAvailable ? "on" : ""}`} onClick={() => void toggleAvailability()}><span className="toggle-track"><i /></span><span>{isAvailable ? "Accepting requests" : "Paused"}</span><ChevronDown size={14} /></button>}
            {page === "catalog" && <button className="button button-primary" onClick={() => setAddMedicineOpen(true)}><Plus size={17} /> Add medicine</button>}
          </div>

              {page === "requests" && <RequestsPage
            requests={filteredRequests}
            selectedRequest={selectedRequest}
            selectedId={selectedId}
            query={query}
            filter={filter}
            isAvailable={isAvailable}
            onQuery={setQuery}
            onFilter={setFilter}
            onSelect={setSelectedId}
            onReview={() => void openPrescriptionReview()}
            onSendOffer={sendOffer}
            onDecline={declineRequest}
            onNotify={notify}
            catalog={catalog}
            onAddOfferMedicine={addOfferMedicine}
          />}
              {page === "catalog" && <CatalogPage catalog={catalog} query={query} onQuery={setQuery} onToggle={toggleCarried} onPrice={updatePrice} onCommitPrice={persistPrice} onNotify={notify} />}
              {page === "orders" && <OrdersPage orders={orders} onAdvance={advanceOrder} isDemo={isDemo} />}
        </div>
      </main>

      {selectedRequest && isPrescriptionOpen && <PrescriptionDialog request={selectedRequest} prescriptionData={prescriptionData} isDemo={isDemo} onClose={() => setPrescriptionOpen(false)} onDecision={savePrescriptionDecision} />}
      {isAddMedicineOpen && <AddMedicineDialog catalog={catalog} onClose={() => setAddMedicineOpen(false)} onAdd={(id, price) => {
        setCatalog((current) => current.map((medicine) => medicine.id === id ? { ...medicine, carried: true, price } : medicine));
        setAddMedicineOpen(false);
        if (liveToken) void pharmacistApi.saveCarry(liveToken, id, price).then(() => refreshLiveData(liveToken)).then(() => notify("Medicine added to your carry list.")).catch((error) => notify(error instanceof Error ? error.message : "Couldn't add medicine."));
        else notify("Medicine added to your carry list in this demo.");
      }} />}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onLogin={signIn} onRegister={registerPharmacy} />}
      {toast && <div role="status" className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function ArrowUpRightIcon() {
  return <ArrowRight size={14} className="support-arrow" />;
}

function RequestsPage({
  requests,
  selectedRequest,
  selectedId,
  query,
  filter,
  isAvailable,
  onQuery,
  onFilter,
  onSelect,
  onReview,
  onSendOffer,
  onDecline,
  onNotify,
  catalog,
  onAddOfferMedicine,
}: {
  requests: MedicineRequest[];
  selectedRequest: MedicineRequest | null;
  selectedId: string;
  query: string;
  filter: string;
  isAvailable: boolean;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSelect: (id: string) => void;
  onReview: () => void;
  onSendOffer: () => void;
  onDecline: () => void;
  onNotify: (message: string) => void;
  catalog: CatalogMedicine[];
  onAddOfferMedicine: (requestId: string, medicineId: string, quantity: number) => void;
}) {
  const needingResponse = requests.filter((request) => ["new", "reviewing"].includes(request.status)).length;
  const rxCount = requests.filter((request) => request.prescription && request.prescriptionDecision === null).length;

  return (
    <>
      <section className="metric-strip" aria-label="Request summary">
        <div className="metric"><span className="metric-icon teal"><ArrowDownLeft size={17} /></span><div><strong>{needingResponse}</strong><span>Need a response</span></div><span className="metric-note">in your queue</span></div>
        <div className="metric"><span className="metric-icon amber"><FileCheck2 size={17} /></span><div><strong>{rxCount}</strong><span>Prescription review</span></div><span className="metric-note">pending</span></div>
        <div className="metric metric-open"><span className={`open-pill ${isAvailable ? "available" : "paused"}`}><span />{isAvailable ? "Taking requests" : "Paused"}</span><span className="metric-note">Change availability above</span></div>
      </section>

      <section className="request-workspace">
        <div className="queue-panel">
          <div className="panel-heading queue-heading"><div><h2>Incoming requests</h2><span>{requests.length} requests in this view</span></div><button className="icon-button quiet" aria-label="Filter requests" onClick={() => onFilter(filter === "All requests" ? "Needs response" : "All requests")}><SlidersHorizontal size={17} /></button></div>
          <div className="queue-controls"><label className="search-field"><Search size={16} /><input aria-label="Search requests" placeholder="Search requests" value={query} onChange={(event) => onQuery(event.target.value)} /><kbd>/</kbd></label><select value={filter} onChange={(event) => onFilter(event.target.value)} aria-label="Filter requests"><option>All requests</option><option>Needs response</option><option>Offer sent</option></select></div>
          <div className="request-list">
            {requests.length === 0 ? <div className="empty-state"><Search size={22} /><strong>No matching requests</strong><span>Try a different search or filter.</span></div> : requests.map((request) => (
              <button key={request.id} className={`request-row ${request.id === selectedId ? "selected" : ""}`} onClick={() => onSelect(request.id)}>
                <span className={`patient-avatar avatar-${request.initials.charCodeAt(0) % 3}`}>{request.initials}</span>
                <span className="request-row-main"><span className="request-row-top"><strong>{request.patient}</strong><span className={`status-tag status-${request.status.replace(" ", "-")}`}>{request.status}</span></span><span className="request-medicine-preview">{request.medicines.map((medicine) => medicine.name).join(", ")}</span><span className="request-row-meta"><MapPin size={12} />{request.distance} · {request.received}{request.prescription && <><span className="meta-dot">·</span><FileCheck2 size={12} /> Rx</>}</span></span>
                <ChevronRight size={16} className="row-chevron" />
              </button>
            ))}
          </div>
          <div className="queue-footer"><ShieldCheck size={15} /><span>Requests go to up to 5 nearby pharmacies</span></div>
        </div>

        <div className="detail-panel">
          {selectedRequest ? <>
            <div className="detail-header"><div><div className="detail-ref">REQUEST <span>{selectedRequest.id}</span><span className={`status-tag status-${selectedRequest.status.replace(" ", "-")}`}>{selectedRequest.status}</span></div><h2>{selectedRequest.patient}</h2><div className="detail-location"><MapPin size={14} />{selectedRequest.area}<span>·</span>{selectedRequest.distance}</div></div><button className="icon-button quiet" aria-label="More request actions" onClick={() => onNotify("Request actions are available in the demo flow.")}><Menu size={18} /></button></div>
            <div className="request-timing"><Clock3 size={15} /><span>{selectedRequest.deadline}</span><span className="timing-separator" /><span>Received {selectedRequest.received}</span></div>

            {selectedRequest.prescriptionOnly && <PrescriptionProductPicker catalog={catalog} requestId={selectedRequest.id} onAdd={onAddOfferMedicine} />}

            <div className="detail-section">
              <div className="section-label"><span>MEDICINES REQUESTED</span><span>{selectedRequest.medicines.length} items</span></div>
              <div className="requested-list">
                {selectedRequest.medicines.map((medicine) => (
                  <div className="requested-item" key={medicine.id}>
                    <span className="medicine-symbol"><HeartPulse size={17} /></span>
                    <span className="requested-name">
                      <strong>{medicine.name} <span>{medicine.strength}</span></strong>
                      <small>{medicine.form} · customer needs {medicine.quantity} {medicine.unit}{medicine.quantity > 1 ? "s" : ""}</small>
                    </span>
                    <span className="requested-quote">₹{medicine.quotePrice}<small>your offer / pack</small></span>
                  </div>
                ))}
              </div>
            </div>

            {selectedRequest.prescription && <div className={`prescription-notice ${selectedRequest.prescriptionDecision === "matches" ? "reviewed" : ""}`}><div className="rx-icon"><FileImage size={18} /></div><div className="rx-copy"><strong>{selectedRequest.prescriptionDecision === "matches" ? "Prescription matches request" : selectedRequest.prescriptionDecision === "clarification" ? "Clarification needed" : selectedRequest.prescriptionDecision === "not-approved" ? "Prescription not approved" : "Prescription needs review"}</strong><span>{selectedRequest.prescriptionDecision ? "Decision recorded by the pharmacist in this demo." : "Compare the prescription with the requested medicine before responding."}</span></div><button className="button button-secondary button-small" onClick={onReview}>{selectedRequest.prescriptionDecision ? "Update review" : "Review"}<ChevronRight size={14} /></button></div>}

            <div className="offer-composer">
              <div className="offer-composer-heading">
                <div><span className="section-label-text">YOUR RESPONSE</span><h3>Confirm availability & price</h3></div>
                <span className="manual-check"><Stethoscope size={14} />Checked by you</span>
              </div>
              <p>Check your actual shelf stock before sending. Your carry list is only used to route requests.</p>
              <div className="offer-total">
                <span>Indicative offer total</span>
                <strong>₹{selectedRequest.medicines.reduce((total, medicine) => total + medicine.quotePrice * medicine.quantity, 0)}</strong>
              </div>
              <div className="offer-actions">
                <button className="button button-primary" onClick={onSendOffer} disabled={["declined", "offer sent"].includes(selectedRequest.status)}><Check size={16} />{selectedRequest.status === "offer sent" ? "Offer already sent" : "Send offer"}</button>
                <button className="button button-quiet" onClick={onDecline} disabled={["declined", "offer sent"].includes(selectedRequest.status)}>Unable to fulfil</button>
              </div>
              <div className="offer-legal">Sending an offer confirms you checked availability. The customer chooses whether to place an order.</div>
            </div>
          </> : <div className="empty-state detail-empty"><LayoutDashboard size={24} /><strong>Select a request</strong><span>Choose a request from the queue to review it.</span></div>}
        </div>
      </section>
    </>
  );
}

function PrescriptionProductPicker({ catalog, requestId, onAdd }: { catalog: CatalogMedicine[]; requestId: string; onAdd: (requestId: string, medicineId: string, quantity: number) => void }) {
  const carried = catalog.filter((medicine) => medicine.carried);
  const [medicineId, setMedicineId] = useState(carried[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  return (
    <div className="prescription-product-picker">
      <span className="section-label-text">BUILD OFFER FROM PRESCRIPTION</span>
      <p>After reviewing the prescription, select the catalog product and pack quantity you can provide.</p>
      <div className="picker-controls">
        <select aria-label="Medicine from carry list" value={medicineId} onChange={(event) => setMedicineId(event.target.value)}>
          {carried.length ? carried.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.strength || medicine.form}</option>) : <option value="">No carried medicines</option>}
        </select>
        <label className="picker-quantity">Packs<input aria-label="Pack quantity" type="number" min="1" max="100" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        <button className="button button-secondary button-small" disabled={!medicineId || quantity < 1 || quantity > 100} onClick={() => onAdd(requestId, medicineId, quantity)}><Plus size={14} />Add to offer</button>
      </div>
    </div>
  );
}

function CatalogPage({ catalog, query, onQuery, onToggle, onPrice, onCommitPrice, onNotify }: { catalog: CatalogMedicine[]; query: string; onQuery: (value: string) => void; onToggle: (id: string) => void; onPrice: (id: string, value: string) => void; onCommitPrice: (id: string, value: number) => void; onNotify: (message: string) => void }) {
  const term = query.trim().toLowerCase();
  const visible = catalog.filter((medicine) => [medicine.name, medicine.strength, medicine.manufacturer, medicine.form].join(" ").toLowerCase().includes(term));
  const carriedCount = catalog.filter((medicine) => medicine.carried).length;

  return (
    <section className="catalog-panel">
      <div className="catalog-toolbar"><div className="catalog-summary"><span className="catalog-count">{carriedCount}</span><span>medicines on your carry list</span><span className="summary-divider" /><span>Prices are set by your pharmacy</span></div><label className="search-field catalog-search"><Search size={16} /><input aria-label="Search medicine catalog" placeholder="Search by medicine or brand" value={query} onChange={(event) => onQuery(event.target.value)} /><kbd>/</kbd></label></div>
      <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>MEDICINE</th><th>MANUFACTURER</th><th>YOUR PRICE</th><th>WE CARRY THIS</th><th aria-label="Actions" /></tr></thead><tbody>{visible.map((medicine) => <tr key={medicine.id} className={!medicine.carried ? "not-carried" : ""}><td><div className="catalog-product"><span className="medicine-symbol small-symbol"><HeartPulse size={15} /></span><span><strong>{medicine.name}</strong><small>{medicine.strength} · {medicine.form}</small></span></div></td><td className="manufacturer-cell">{medicine.manufacturer}</td><td><label className="price-input"><span>₹</span><input aria-label={`${medicine.name} price`} type="number" min="0" step="0.01" value={medicine.price} onChange={(event) => onPrice(medicine.id, event.target.value)} onBlur={(event) => onCommitPrice(medicine.id, Number(event.currentTarget.value))} /></label></td><td><button className={`carry-toggle ${medicine.carried ? "checked" : ""}`} role="switch" aria-checked={medicine.carried} aria-label={`${medicine.carried ? "Remove" : "Add"} ${medicine.name} ${medicine.carried ? "from" : "to"} carry list`} onClick={() => onToggle(medicine.id)}><span /><strong>{medicine.carried ? "Carried" : "Not carried"}</strong></button></td><td><button className="icon-button quiet row-action" aria-label={`Edit ${medicine.name}`} onClick={() => onNotify("Update the price directly in the price field.")}><ChevronRight size={16} /></button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-state catalog-empty"><Search size={22} /><strong>No medicines found</strong><span>Try the generic name, brand, or manufacturer.</span></div>}</div>
      <div className="catalog-footnote"><ShieldCheck size={15} /><span>Carry list helps route requests. You confirm actual availability for every request.</span><span className="footnote-end">No stock quantities are collected.</span></div>
    </section>
  );
}

function OrdersPage({ orders, onAdvance, isDemo }: { orders: WorkspaceOrder[]; onAdvance: (order: WorkspaceOrder) => void; isDemo: boolean }) {
  const nextAction: Record<string, string> = { "Pharmacy Confirmed": "Start preparing", Preparing: "Out for delivery", "Out for Delivery": "Mark delivered" };
  return (
    <section className="orders-panel">
      <div className="orders-heading"><div><h2>Accepted offers</h2><span>Orders are created after customers choose your offer.</span></div><div className="orders-filter"><span className="state-dot" /> Active orders <ChevronDown size={14} /></div></div>
      {orders.length ? <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.id}</strong><small>{order.placed}</small></td><td>{order.patient}<small>{order.area}</small></td><td>{order.items}</td><td>₹{order.total}</td><td><span className={`order-status ${order.status === "Delivered" ? "ready" : "preparing"}`}><span />{order.status}</span></td><td>{nextAction[order.status] && <button className="button button-secondary button-small" onClick={() => onAdvance(order)}>{nextAction[order.status]}</button>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><PackageCheck size={22} /><strong>No orders yet</strong><span>Orders will appear when a customer accepts one of your offers.</span></div>}
      {isDemo && <div className="orders-demo-note"><span className="demo-dot" /> Sample orders shown for the prototype</div>}
    </section>
  );
}

function PrescriptionDialog({ request, prescriptionData, isDemo, onClose, onDecision }: { request: MedicineRequest; prescriptionData: { content_type: string; data_base64: string } | null; isDemo: boolean; onClose: () => void; onDecision: (decision: Exclude<PrescriptionDecision, null>) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog rx-dialog" role="dialog" aria-modal="true" aria-labelledby="rx-title">
        <div className="dialog-header">
          <div><span className="section-label-text">PHARMACIST REVIEW</span><h2 id="rx-title">Prescription · {request.id}</h2></div>
          <button className="icon-button quiet" aria-label="Close prescription review" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="privacy-strip"><ShieldCheck size={16} /><span>Shared with this pharmacy for this request only. This sample preview contains no patient document.</span></div>
        {prescriptionData ? <div className="document-placeholder"><img className="prescription-image" src={prescriptionImage(prescriptionData)} alt="Customer-uploaded prescription for pharmacist review" /></div> : <div className="document-placeholder"><div className="document-page"><div className="document-brand"><span className="document-mark">+</span><span>Prescription preview</span></div><div className="document-line short" /><div className="document-line" /><div className="document-line medium" /><div className="document-rx">Rx</div><div className="document-line" /><div className="document-line short" /><div className="document-line medium" /><div className="document-signature">Sample document placeholder</div></div></div>}
        <div className="review-check"><span className="review-check-icon"><Stethoscope size={17} /></span><div><strong>Clinical decision stays with the pharmacist</strong><span>Compare the prescribed medicine, strength, and form with the request. This website does not interpret prescriptions.</span></div></div>
        {isDemo && <div className="decision-note">Demo only: the preview is not a real prescription. These actions only demonstrate the review workflow.</div>}
        <div className="dialog-actions review-actions">
          <button className="button button-quiet" onClick={onClose}>Close</button>
          <button className="button button-secondary" onClick={() => onDecision("clarification")}>Needs clarification</button>
          <button className="button button-quiet" onClick={() => onDecision("not-approved")}>Cannot approve</button>
          <button className="button button-primary" onClick={() => onDecision("matches")}><BadgeCheck size={16} />Matches request</button>
        </div>
      </section>
    </div>
  );
}

function AddMedicineDialog({ catalog, onClose, onAdd }: { catalog: CatalogMedicine[]; onClose: () => void; onAdd: (id: string, price: number) => void }) {
  const available = catalog.filter((medicine) => !medicine.carried);
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? "");
  const selected = available.find((medicine) => medicine.id === selectedId);
  const [price, setPrice] = useState(selected ? String(selected.price) : "");

  function choose(id: string) {
    setSelectedId(id);
    const medicine = available.find((item) => item.id === id);
    setPrice(medicine ? String(medicine.price) : "");
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog add-dialog" role="dialog" aria-modal="true" aria-labelledby="add-title"><div className="dialog-header"><div><span className="section-label-text">PHARMACY CATALOG</span><h2 id="add-title">Add a medicine you carry</h2></div><button className="icon-button quiet" aria-label="Close add medicine dialog" onClick={onClose}><X size={18} /></button></div><p className="dialog-intro">Choose a product from the shared demo catalog and set your pharmacy's price.</p><label className="form-label">Medicine<select value={selectedId} onChange={(event) => choose(event.target.value)}>{available.length ? available.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.strength} · {medicine.manufacturer}</option>) : <option value="">No unlisted medicines available</option>}</select></label><label className="form-label">Your price<div className="currency-input"><span>₹</span><input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></div></label><div className="no-quantity-note"><CheckCircle2 size={16} /><span>This adds the medicine to your carry list. You won't be asked for a stock count.</span></div><div className="dialog-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!selectedId || Number(price) <= 0} onClick={() => onAdd(selectedId, Number(price))}><Plus size={16} />Add to carry list</button></div></section></div>;
}

export default App;