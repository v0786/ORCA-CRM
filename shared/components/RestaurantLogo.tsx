import { useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseServices } from "../firebase/config";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import OrcaBadge from "./OrcaBadge";
import OrcaButton from "./OrcaButton";
import OrcaCard from "./OrcaCard";

type ImageType = "image/png" | "image/jpeg" | "image/svg+xml";

type CropState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
  outputSize: number;
};

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES: ImageType[] = ["image/png", "image/jpeg", "image/svg+xml"];

function fileError(file: File | null) {
  if (!file) return "Choose an image file.";
  if (!ACCEPTED_TYPES.includes(file.type as ImageType)) return "Only PNG, JPG, or SVG are allowed.";
  if (file.size > MAX_BYTES) return "Max file size is 2MB.";
  return null;
}

function isSvg(file: File) {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

async function rasterCropToPng(file: File, crop: CropState): Promise<Blob> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  const size = crop.outputSize;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);

  const scale = crop.zoom;
  const srcW = size / scale;
  const srcH = size / scale;

  const maxX = Math.max(0, img.width - srcW);
  const maxY = Math.max(0, img.height - srcH);
  const sx = clamp(crop.offsetX, 0, 1) * maxX;
  const sy = clamp(crop.offsetY, 0, 1) * maxY;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, size, size);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))), "image/png");
  });
  if (blob.size > MAX_BYTES) {
    throw new Error("Cropped image exceeds 2MB. Reduce output size.");
  }
  return blob;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function RestaurantLogo(props: {
  size?: number;
  className?: string;
  editable?: boolean;
}) {
  const auth = useAuth();
  const perms = usePermissions();
  const { db, storage, functions } = getFirebaseServices();

  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;
  const logoPath = auth.status === "authenticated" ? auth.user.restaurant.logoStoragePath ?? null : null;

  const canEdit =
    props.editable !== false &&
    auth.status === "authenticated" &&
    perms.status === "authenticated" &&
    perms.hasPermission("settings:edit");

  const size = props.size ?? 40;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1.2, offsetX: 0.5, offsetY: 0.5, outputSize: 512 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!logoPath) {
        setLogoUrl(null);
        return;
      }
      try {
        const url = await getDownloadURL(ref(storage, logoPath));
        if (!cancelled) setLogoUrl(url);
      } catch {
        if (!cancelled) setLogoUrl(null);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [logoPath, storage]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const displaySrc = logoUrl ?? "/favicon.svg";

  const inputError = useMemo(() => fileError(file), [file]);

  async function uploadViaCallable(blob: Blob, contentType: string) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(new Error("Failed to read image"));
      r.readAsDataURL(blob);
    });

    const fn = httpsCallable(functions, "uploadRestaurantLogo");
    const res = await fn({ restaurantId, contentType, dataUrl });
    const out = res.data as { logoStoragePath?: unknown };
    const path = typeof out.logoStoragePath === "string" ? out.logoStoragePath : "";
    if (!path) throw new Error("Upload failed");
    return path;
  }

  async function uploadViaClient(blob: Blob, contentType: string) {
    if (!restaurantId) throw new Error("Missing restaurant");
    const path = `restaurantLogos/${restaurantId}/logo_${Date.now()}.png`;
    await uploadBytes(ref(storage, path), blob, { contentType });

    const restaurantRef = doc(db, "restaurants", restaurantId);
    await updateDoc(restaurantRef, {
      logoStoragePath: path,
      logoUpdatedAt: new Date(),
    });

    return path;
  }

  async function onSave() {
    setError(null);
    setOk(null);
    if (!restaurantId) return;
    if (!file) {
      setError("Choose an image file.");
      return;
    }
    const err = fileError(file);
    if (err) {
      setError(err);
      return;
    }

    setBusy(true);
    try {
      const previousPath = logoPath;

      let blob: Blob;
      let contentType: string;
      if (isSvg(file)) {
        blob = file;
        contentType = "image/svg+xml";
      } else {
        blob = await rasterCropToPng(file, crop);
        contentType = "image/png";
      }

      let newPath: string;
      try {
        newPath = await uploadViaCallable(blob, contentType);
      } catch {
        newPath = await uploadViaClient(blob, contentType);
      }

      if (previousPath && previousPath !== newPath) {
        await deleteObject(ref(storage, previousPath)).catch(() => {});
      }

      const url = await getDownloadURL(ref(storage, newPath));
      setLogoUrl(url);
      setOk("Logo updated.");
      setFile(null);
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update logo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={`relative inline-flex items-center ${props.className ?? ""}`}>
        <img
          src={displaySrc}
          alt="Restaurant logo"
          style={{ width: size, height: size }}
          className="rounded-xl border border-white/10 bg-white/5 object-cover"
        />
        {canEdit ? (
          <button
            type="button"
            className="absolute -bottom-2 -right-2 rounded-full border border-white/15 bg-zinc-950/90 px-2 py-1 text-[11px] text-white/80 hover:bg-zinc-900"
            onClick={() => {
              setOpen(true);
              setError(null);
              setOk(null);
            }}
          >
            Edit
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setOpen(false)} />
          <div className="relative w-full max-w-xl">
            <OrcaCard className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Update logo</div>
                  <div className="mt-1 text-sm text-white/70">
                    PNG/JPG can be cropped and resized. SVG uploads as-is.
                  </div>
                </div>
                <OrcaBadge tone="gray">Max 2MB</OrcaBadge>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <label className="block text-sm">
                    <div className="text-xs text-white/70 mb-1">Choose file</div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      onChange={(e) => {
                        const f = e.currentTarget.files?.[0] ?? null;
                        setFile(f);
                        setError(null);
                        setOk(null);
                      }}
                    />
                  </label>

                  {previewUrl ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/60 mb-2">Preview</div>
                      <div className="flex items-center gap-3">
                        <img
                          src={previewUrl}
                          alt="New logo preview"
                          className="h-14 w-14 rounded-xl border border-white/10 bg-white/5 object-cover"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{file?.name}</div>
                          <div className="text-xs text-white/60">
                            {file ? `${(file.size / 1024).toFixed(0)} KB` : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {file && !isSvg(file) ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">Crop / Resize</div>
                        <OrcaBadge tone="gray">{crop.outputSize}px</OrcaBadge>
                      </div>

                      <label className="block">
                        <div className="text-xs text-white/70 mb-1">Zoom</div>
                        <input
                          type="range"
                          min={1}
                          max={3}
                          step={0.05}
                          value={crop.zoom}
                          onChange={(e) => setCrop((s) => ({ ...s, zoom: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </label>

                      <label className="block">
                        <div className="text-xs text-white/70 mb-1">Horizontal crop</div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={crop.offsetX}
                          onChange={(e) => setCrop((s) => ({ ...s, offsetX: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </label>

                      <label className="block">
                        <div className="text-xs text-white/70 mb-1">Vertical crop</div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={crop.offsetY}
                          onChange={(e) => setCrop((s) => ({ ...s, offsetY: Number(e.target.value) }))}
                          className="w-full"
                        />
                      </label>

                      <label className="block text-sm">
                        <div className="text-xs text-white/70 mb-1">Output size</div>
                        <select
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
                          value={crop.outputSize}
                          onChange={(e) => setCrop((s) => ({ ...s, outputSize: Number(e.target.value) }))}
                        >
                          {[256, 384, 512, 768, 1024].map((n) => (
                            <option key={n} value={n}>
                              {n} × {n}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs text-white/60 mb-2">Live display</div>
                    <div className="flex items-center gap-3">
                      <img
                        src={previewUrl ?? displaySrc}
                        alt="Logo display preview"
                        className="h-12 w-12 rounded-xl border border-white/10 bg-white/5 object-cover"
                      />
                      <div className="text-sm text-white/70">
                        This is how the logo appears in headers and cards.
                      </div>
                    </div>
                  </div>

                  {inputError ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {inputError}
                    </div>
                  ) : null}

                  {error ? (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                      {error}
                    </div>
                  ) : null}
                  {ok ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                      {ok}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <OrcaButton
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="flex-1"
                >
                  Cancel
                </OrcaButton>
                <OrcaButton onClick={onSave} disabled={busy || !!inputError} className="flex-1">
                  {busy ? "Saving..." : "Save"}
                </OrcaButton>
              </div>
            </OrcaCard>
          </div>
        </div>
      ) : null}
    </>
  );
}
