import { useEffect, useMemo, useState, type FormEvent, type HTMLAttributes } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import OrcaBadge from "../../../../shared/components/OrcaBadge";
import OrcaButton from "../../../../shared/components/OrcaButton";
import OrcaCard from "../../../../shared/components/OrcaCard";
import OrcaInput from "../../../../shared/components/OrcaInput";
import { getFirebaseServices } from "../../../../shared/firebase/config";
import { useAuth } from "../../../../shared/hooks/useAuth";
import {
  hasFormErrors,
  normalizeIfsc,
  normalizePan,
  validateStaffForm,
  type StaffForm,
  type StaffFormErrors,
} from "../staff/validation";

type StaffRecord = StaffForm & {
  id: string;
  restaurantId: string;
  createdAt?: unknown;
  createdByUid?: string;
};

type StaffDoc = {
  restaurantId: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  uan: string;
  address: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  bankBranch: string;
  aadharNumber: string;
  panNumber: string;
  officialEmail: string;
  mobilePhone: string;
  createdAt: unknown;
  updatedAt: unknown;
  createdByUid: string;
  updatedByUid: string;
};

type StaffDocumentCategory =
  | "Identity Proof"
  | "Education"
  | "Employment"
  | "Other";

type PendingDoc = {
  id: string;
  category: StaffDocumentCategory;
  file: File;
};

type StaffDocumentRecord = {
  id: string;
  category: StaffDocumentCategory;
  fileName: string;
  contentType: string;
  size: number;
  storagePath: string;
  downloadUrl: string;
  uploadedAt?: unknown;
  uploadedByUid?: string;
};

const STAFF_DRAFT_KEY_PREFIX = "orca_staff_draft_v1";

function toCsv(rows: StaffRecord[]) {
  const headers: Array<keyof StaffForm> = [
    "firstName",
    "lastName",
    "employeeId",
    "uan",
    "address",
    "bankAccountNumber",
    "bankIfsc",
    "bankName",
    "bankBranch",
    "aadharNumber",
    "panNumber",
    "officialEmail",
    "mobilePhone",
  ];
  const escape = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [
    ["id", ...headers].join(","),
    ...rows.map((r) => [r.id, ...headers.map((h) => escape(String(r[h] ?? "")))].join(",")),
  ];
  return lines.join("\n");
}

export default function StaffPage() {
  const auth = useAuth();
  const { db, storage } = getFirebaseServices();
  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;
  const actorUid = auth.status === "authenticated" ? auth.user.firebaseUser.uid : null;

  const [filter, setFilter] = useState("");
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const [form, setForm] = useState<StaffForm>({
    firstName: "",
    lastName: "",
    employeeId: "",
    uan: "",
    address: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    bankBranch: "",
    aadharNumber: "",
    panNumber: "",
    officialEmail: "",
    mobilePhone: "",
  });
  const [errors, setErrors] = useState<StaffFormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof StaffForm, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [pendingCategory, setPendingCategory] = useState<StaffDocumentCategory>("Identity Proof");
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<StaffDocumentRecord[]>([]);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const csrfToken = useMemo(() => {
    const key = "orca_staff_csrf_v1";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(key, next);
    return next;
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    const q = query(collection(db, "staff"), where("restaurantId", "==", restaurantId));
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((d) => {
        const data = d.data() as Partial<StaffDoc>;
        return {
          id: d.id,
          restaurantId: String(data.restaurantId ?? ""),
          firstName: String(data.firstName ?? ""),
          lastName: String(data.lastName ?? ""),
          employeeId: String(data.employeeId ?? ""),
          uan: String(data.uan ?? ""),
          address: String(data.address ?? ""),
          bankAccountNumber: String(data.bankAccountNumber ?? ""),
          bankIfsc: String(data.bankIfsc ?? ""),
          bankName: String(data.bankName ?? ""),
          bankBranch: String(data.bankBranch ?? ""),
          aadharNumber: String(data.aadharNumber ?? ""),
          panNumber: String(data.panNumber ?? ""),
          officialEmail: String(data.officialEmail ?? ""),
          mobilePhone: String(data.mobilePhone ?? ""),
          createdAt: data.createdAt,
          createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : undefined,
        };
      });
      next.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      setStaff(next);
      setSelectedStaffId((current) =>
        current && !next.some((s) => s.id === current) ? null : current
      );
    });
    return () => unsub();
  }, [db, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    if (!selectedStaffId) return;
    const q = query(
      collection(db, "staff", selectedStaffId, "documents"),
      where("restaurantId", "==", restaurantId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((d) => {
        const data = d.data() as Partial<StaffDocumentRecord>;
        return {
          id: d.id,
          category: (data.category as StaffDocumentCategory) ?? "Other",
          fileName: String(data.fileName ?? ""),
          contentType: String(data.contentType ?? "application/octet-stream"),
          size: Number(data.size ?? 0),
          storagePath: String(data.storagePath ?? ""),
          downloadUrl: String(data.downloadUrl ?? ""),
          uploadedAt: data.uploadedAt,
          uploadedByUid: typeof data.uploadedByUid === "string" ? data.uploadedByUid : undefined,
        };
      });
      next.sort((a, b) => a.fileName.localeCompare(b.fileName));
      setUploadedDocs(next);
    });
    return () => unsub();
  }, [db, restaurantId, selectedStaffId]);

  const filteredStaff = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => {
      const hay = [
        s.firstName,
        s.lastName,
        s.employeeId,
        s.officialEmail,
        s.mobilePhone,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filter, staff]);

  function draftKey() {
    return `${STAFF_DRAFT_KEY_PREFIX}:${restaurantId ?? "unknown"}`;
  }

  function onChange<K extends keyof StaffForm>(key: K, value: string) {
    const nextValue =
      key === "panNumber"
        ? normalizePan(value)
        : key === "bankIfsc"
          ? normalizeIfsc(value)
          : value;
    setForm((s) => ({ ...s, [key]: nextValue }));
    if (touched[key]) {
      const nextErrors = validateStaffForm({ ...form, [key]: nextValue });
      setErrors(nextErrors);
    }
  }

  function markTouched<K extends keyof StaffForm>(key: K) {
    setTouched((t) => ({ ...t, [key]: true }));
    const nextErrors = validateStaffForm(form);
    setErrors(nextErrors);
  }

  function saveDraft() {
    if (!restaurantId) return;
    localStorage.setItem(
      draftKey(),
      JSON.stringify({ form, pendingDocs: pendingDocs.map((d) => ({ id: d.id, category: d.category })) })
    );
    setNotice("Draft saved locally.");
    setErrorBanner(null);
  }

  function loadDraft() {
    if (!restaurantId) return;
    const raw = localStorage.getItem(draftKey());
    if (!raw) {
      setNotice("No saved draft found.");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { form?: Partial<StaffForm> };
      if (parsed.form) {
        setForm((s) => ({ ...s, ...parsed.form }));
        setNotice("Draft loaded.");
        setErrorBanner(null);
      }
    } catch {
      setErrorBanner("Failed to load draft.");
    }
  }

  function clearDraft() {
    if (!restaurantId) return;
    localStorage.removeItem(draftKey());
    setNotice("Draft cleared.");
  }

  function resetForm() {
    setForm({
      firstName: "",
      lastName: "",
      employeeId: "",
      uan: "",
      address: "",
      bankAccountNumber: "",
      bankIfsc: "",
      bankName: "",
      bankBranch: "",
      aadharNumber: "",
      panNumber: "",
      officialEmail: "",
      mobilePhone: "",
    });
    setErrors({});
    setTouched({});
    setPendingDocs([]);
    setNotice(null);
    setErrorBanner(null);
  }

  async function writeAuditLog(action: string, targetStaffId: string, details?: Record<string, unknown>) {
    if (!restaurantId || !actorUid) return;
    await addDoc(collection(db, "auditLogs"), {
      restaurantId,
      actorUid,
      action,
      targetStaffId,
      details: details ?? {},
      createdAt: serverTimestamp(),
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    setErrorBanner(null);

    const nextErrors = validateStaffForm(form);
    setErrors(nextErrors);
    setTouched({
      firstName: true,
      lastName: true,
      employeeId: true,
      uan: true,
      address: true,
      bankAccountNumber: true,
      bankIfsc: true,
      bankName: true,
      bankBranch: true,
      aadharNumber: true,
      panNumber: true,
      officialEmail: true,
      mobilePhone: true,
    });
    if (hasFormErrors(nextErrors)) return;

    const csrfFromDom = (document.getElementById("staff_csrf") as HTMLInputElement | null)?.value ?? "";
    if (!csrfFromDom || csrfFromDom !== csrfToken) {
      setErrorBanner("Security check failed. Refresh and try again.");
      return;
    }

    if (!restaurantId || !actorUid) return;

    setSubmitting(true);
    try {
      const staffRef = await addDoc(collection(db, "staff"), {
        restaurantId,
        ...form,
        panNumber: normalizePan(form.panNumber),
        bankIfsc: normalizeIfsc(form.bankIfsc),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: actorUid,
        updatedByUid: actorUid,
      });

      for (const d of pendingDocs) {
        const docId = crypto.randomUUID();
        const storagePath = `staffDocs/${restaurantId}/${staffRef.id}/${docId}_${d.file.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, d.file);
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(db, "staff", staffRef.id, "documents"), {
          restaurantId,
          staffId: staffRef.id,
          category: d.category,
          fileName: d.file.name,
          contentType: d.file.type || "application/octet-stream",
          size: d.file.size,
          storagePath,
          downloadUrl: url,
          uploadedAt: serverTimestamp(),
          uploadedByUid: actorUid,
        });
        await writeAuditLog("staff:doc_upload", staffRef.id, { fileName: d.file.name, category: d.category });
      }

      await writeAuditLog("staff:create", staffRef.id, { employeeId: form.employeeId });

      setNotice("Staff added successfully.");
      localStorage.removeItem(draftKey());
      resetForm();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to add staff.");
    } finally {
      setSubmitting(false);
    }
  }

  function openDelete(staffId: string) {
    setDeleteTargetId(staffId);
    setConfirmDeleteOpen(true);
    setErrorBanner(null);
    setNotice(null);
  }

  async function confirmDelete() {
    if (!restaurantId || !actorUid || !deleteTargetId) return;
    setDeleteBusy(true);
    try {
      const docsSnap = await getDocs(
        query(collection(db, "staff", deleteTargetId, "documents"), where("restaurantId", "==", restaurantId))
      );

      const batch = writeBatch(db);
      docsSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, "staff", deleteTargetId));
      await batch.commit();

      await Promise.all(
        docsSnap.docs.map(async (d) => {
          const data = d.data() as { storagePath?: unknown };
          const storagePath = typeof data.storagePath === "string" ? data.storagePath : "";
          if (!storagePath) return;
          await deleteObject(ref(storage, storagePath)).catch(() => {});
        })
      );

      await writeAuditLog("staff:delete", deleteTargetId);

      if (selectedStaffId === deleteTargetId) setSelectedStaffId(null);
      setConfirmDeleteOpen(false);
      setDeleteTargetId(null);
      setNotice("Staff removed.");
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to remove staff.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function deleteUploadedDoc(docId: string) {
    if (!restaurantId || !actorUid || !selectedStaffId) return;
    const docRec = uploadedDocs.find((d) => d.id === docId);
    if (!docRec) return;
    try {
      await deleteDoc(doc(db, "staff", selectedStaffId, "documents", docId));
      if (docRec.storagePath) {
        await deleteObject(ref(storage, docRec.storagePath)).catch(() => {});
      }
      await writeAuditLog("staff:doc_delete", selectedStaffId, { fileName: docRec.fileName, category: docRec.category });
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to delete document.");
    }
  }

  function exportCsv() {
    const csv = toCsv(filteredStaff);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const deleteTarget = deleteTargetId ? staff.find((s) => s.id === deleteTargetId) : null;

  if (auth.status !== "authenticated") {
    return <div className="text-white/70 p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Staff Management</div>
          <div className="mt-1 text-sm text-white/70">
            Add staff, upload documents, and remove staff with audit logging.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OrcaButton variant="secondary" onClick={exportCsv} disabled={!filteredStaff.length}>
            Export CSV
          </OrcaButton>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      {errorBanner ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {errorBanner}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <OrcaCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Staff</div>
            <div className="w-full sm:w-64">
              <OrcaInput
                label="Search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name, employee ID, email, phone"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {filteredStaff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStaffId(s.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selectedStaffId === s.id
                    ? "border-orange-500/40 bg-orange-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {s.firstName} {s.lastName}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      Employee ID: {s.employeeId}
                    </div>
                    <div className="mt-1 text-xs text-white/60 truncate">
                      {s.officialEmail} • {s.mobilePhone}
                    </div>
                  </div>
                  <OrcaBadge tone="gray">Active</OrcaBadge>
                </div>
                <div className="mt-3 flex gap-2">
                  <OrcaButton
                    variant="secondary"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedStaffId(s.id);
                    }}
                    className="flex-1"
                  >
                    View
                  </OrcaButton>
                  <OrcaButton
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDelete(s.id);
                    }}
                    className="flex-1"
                  >
                    Remove
                  </OrcaButton>
                </div>
              </button>
            ))}

            {!filteredStaff.length ? (
              <div className="text-sm text-white/60">No staff found.</div>
            ) : null}
          </div>

          {selectedStaffId ? (
            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Documents</div>
                <OrcaBadge tone="gray">{uploadedDocs.length}</OrcaBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {uploadedDocs.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.fileName}</div>
                      <div className="mt-1 text-xs text-white/60">
                        {d.category} • {(d.size / 1024).toFixed(0)} KB
                      </div>
                      {d.downloadUrl ? (
                        <a
                          href={d.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs text-orange-300 hover:text-orange-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-rose-300 hover:text-rose-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteUploadedDoc(d.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {!uploadedDocs.length ? (
                  <div className="text-sm text-white/60">No uploaded documents for this staff.</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="text-sm font-semibold">Add Staff</div>
          <div className="mt-1 text-xs text-white/60">
            Drafts save locally. Uploaded files attach on submit.
          </div>

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <input id="staff_csrf" type="hidden" value={csrfToken} readOnly />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="First name"
                value={form.firstName}
                error={touched.firstName ? errors.firstName : undefined}
                onBlur={() => markTouched("firstName")}
                onChange={(v) => onChange("firstName", v)}
              />
              <Field
                label="Last name"
                value={form.lastName}
                error={touched.lastName ? errors.lastName : undefined}
                onBlur={() => markTouched("lastName")}
                onChange={(v) => onChange("lastName", v)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Employee ID"
                value={form.employeeId}
                error={touched.employeeId ? errors.employeeId : undefined}
                onBlur={() => markTouched("employeeId")}
                onChange={(v) => onChange("employeeId", v)}
              />
              <Field
                label="UAN"
                value={form.uan}
                error={touched.uan ? errors.uan : undefined}
                onBlur={() => markTouched("uan")}
                onChange={(v) => onChange("uan", v)}
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="block">
                <div className="mb-1 text-xs text-white/70">Residential address</div>
                <textarea
                  className={`w-full min-h-24 rounded-xl border bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 ${
                    touched.address && errors.address ? "border-rose-500/40" : "border-white/10"
                  }`}
                  value={form.address}
                  onChange={(e) => onChange("address", e.target.value)}
                  onBlur={() => markTouched("address")}
                  required
                />
                {touched.address && errors.address ? (
                  <div className="mt-1 text-xs text-rose-300">{errors.address}</div>
                ) : null}
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Bank account number"
                value={form.bankAccountNumber}
                error={touched.bankAccountNumber ? errors.bankAccountNumber : undefined}
                onBlur={() => markTouched("bankAccountNumber")}
                onChange={(v) => onChange("bankAccountNumber", v)}
                inputMode="numeric"
              />
              <Field
                label="IFSC code"
                value={form.bankIfsc}
                error={touched.bankIfsc ? errors.bankIfsc : undefined}
                onBlur={() => markTouched("bankIfsc")}
                onChange={(v) => onChange("bankIfsc", v)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Bank name"
                value={form.bankName}
                error={touched.bankName ? errors.bankName : undefined}
                onBlur={() => markTouched("bankName")}
                onChange={(v) => onChange("bankName", v)}
              />
              <Field
                label="Branch"
                value={form.bankBranch}
                error={touched.bankBranch ? errors.bankBranch : undefined}
                onBlur={() => markTouched("bankBranch")}
                onChange={(v) => onChange("bankBranch", v)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Aadhar number"
                value={form.aadharNumber}
                error={touched.aadharNumber ? errors.aadharNumber : undefined}
                onBlur={() => markTouched("aadharNumber")}
                onChange={(v) => onChange("aadharNumber", v)}
                inputMode="numeric"
              />
              <Field
                label="PAN number"
                value={form.panNumber}
                error={touched.panNumber ? errors.panNumber : undefined}
                onBlur={() => markTouched("panNumber")}
                onChange={(v) => onChange("panNumber", v)}
                autoCapitalize="characters"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Official email"
                value={form.officialEmail}
                error={touched.officialEmail ? errors.officialEmail : undefined}
                onBlur={() => markTouched("officialEmail")}
                onChange={(v) => onChange("officialEmail", v)}
                type="email"
                autoComplete="email"
              />
              <Field
                label="Mobile phone"
                value={form.mobilePhone}
                error={touched.mobilePhone ? errors.mobilePhone : undefined}
                onBlur={() => markTouched("mobilePhone")}
                onChange={(v) => onChange("mobilePhone", v)}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Document upload</div>
                <OrcaBadge tone="gray">{pendingDocs.length}</OrcaBadge>
              </div>

              <label className="block text-sm">
                <div className="text-xs text-white/70 mb-1">Category</div>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
                  value={pendingCategory}
                  onChange={(e) => setPendingCategory(e.target.value as StaffDocumentCategory)}
                >
                  <option value="Identity Proof">Identity Proof</option>
                  <option value="Education">Education</option>
                  <option value="Employment">Employment</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label className="block text-sm">
                <div className="text-xs text-white/70 mb-1">Select files</div>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.currentTarget.files ?? []);
                    const next = files
                      .filter((f) => f.size <= 10 * 1024 * 1024)
                      .map((file) => ({ id: crypto.randomUUID(), category: pendingCategory, file }));
                    setPendingDocs((s) => [...s, ...next]);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="mt-1 text-xs text-white/60">
                  Max 10MB per file. Files upload on submit.
                </div>
              </label>

              {pendingDocs.length ? (
                <div className="grid gap-2">
                  {pendingDocs.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-white/10 bg-zinc-950/40 px-3 py-2 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{d.file.name}</div>
                        <div className="mt-1 text-xs text-white/60">
                          {d.category} • {(d.file.size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-rose-300 hover:text-rose-200"
                        onClick={() => setPendingDocs((s) => s.filter((x) => x.id !== d.id))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <OrcaButton type="button" variant="secondary" onClick={saveDraft}>
                Save draft
              </OrcaButton>
              <OrcaButton type="button" variant="secondary" onClick={loadDraft}>
                Load draft
              </OrcaButton>
              <OrcaButton type="button" variant="secondary" onClick={clearDraft}>
                Clear draft
              </OrcaButton>
              <OrcaButton type="button" variant="secondary" onClick={resetForm}>
                Reset
              </OrcaButton>
              <OrcaButton type="submit" disabled={submitting} className="ml-auto">
                {submitting ? "Submitting..." : "Submit"}
              </OrcaButton>
            </div>
          </form>
        </OrcaCard>
      </div>

      {confirmDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (deleteBusy) return;
              setConfirmDeleteOpen(false);
              setDeleteTargetId(null);
            }}
          />
          <div className="relative w-full max-w-lg">
            <OrcaCard className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Confirm removal</div>
                  <div className="mt-1 text-sm text-white/70">
                    This action permanently removes staff data and associated documents.
                  </div>
                </div>
                <OrcaBadge tone="red">Danger</OrcaBadge>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                {deleteTarget ? (
                  <div className="space-y-1">
                    <div className="font-semibold">
                      {deleteTarget.firstName} {deleteTarget.lastName}
                    </div>
                    <div className="text-sm text-white/70">
                      Employee ID: {deleteTarget.employeeId}
                    </div>
                    <div className="text-sm text-white/70">
                      {deleteTarget.officialEmail} • {deleteTarget.mobilePhone}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-white/70">Staff record not found.</div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <OrcaButton
                  variant="secondary"
                  onClick={() => {
                    if (deleteBusy) return;
                    setConfirmDeleteOpen(false);
                    setDeleteTargetId(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </OrcaButton>
                <OrcaButton
                  onClick={confirmDelete}
                  disabled={deleteBusy || !deleteTargetId}
                  className="flex-1"
                >
                  {deleteBusy ? "Removing..." : "Remove"}
                </OrcaButton>
              </div>
            </OrcaCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoCapitalize?: HTMLAttributes<HTMLInputElement>["autoCapitalize"];
}) {
  return (
    <div>
      <OrcaInput
        label={props.label}
        value={props.value}
        type={props.type}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        autoCapitalize={props.autoCapitalize}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        className={props.error ? "border-rose-500/40 focus:border-rose-500/60" : undefined}
        required
      />
      {props.error ? (
        <div className="mt-1 text-xs text-rose-300">{props.error}</div>
      ) : null}
    </div>
  );
}
