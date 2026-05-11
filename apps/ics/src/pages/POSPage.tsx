import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { getFirebaseServices } from "../../../../shared/firebase/config";
import { deductInventoryForOrder } from "../../../../shared/firebase/firestore";
import OrcaButton from "../../../../shared/components/OrcaButton";
import OrcaCard from "../../../../shared/components/OrcaCard";
import OrcaInput from "../../../../shared/components/OrcaInput";
import { useCartStore } from "../state/cartStore";
import type { KitchenStation } from "../../../../shared/firebase/types";

type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

export default function POSPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const { db } = getFirebaseServices();
  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;
  const gstRate = auth.status === "authenticated" ? auth.user.restaurant.gstRate ?? 0 : 0;

  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; sortOrder: number }>
  >([]);
  const [menuItems, setMenuItems] = useState<
    Array<{
      id: string;
      name: string;
      price: number;
      categoryId: string;
      vegFlag: boolean;
      kitchenStation: KitchenStation;
    }>
  >([]);
  const [tables, setTables] = useState<
    Array<{ id: string; name: string; number: number; status: string }>
  >([]);

  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [placing, setPlacing] = useState(false);
  const [orderPlacedCode, setOrderPlacedCode] = useState<string | null>(null);

  const lines = useCartStore((s) => s.lines);
  const subtotal = useCartStore((s) => s.subtotal());
  const discountAmount = useCartStore((s) => s.discountAmount());
  const taxAmount = useCartStore((s) => s.taxAmount());
  const total = useCartStore((s) => s.total());
  const discountPercent = useCartStore((s) => s.discountPercent);
  const setDiscountPercent = useCartStore((s) => s.setDiscountPercent);
  const setTaxRate = useCartStore((s) => s.setTaxRate);
  const addMenuItem = useCartStore((s) => s.addMenuItem);
  const setLineQuantity = useCartStore((s) => s.setLineQuantity);
  const setLineNotes = useCartStore((s) => s.setLineNotes);
  const clear = useCartStore((s) => s.clear);
  const removeLine = useCartStore((s) => s.removeLine);

  const selectedTableId = params.get("tableId");
  const activeOrderId = params.get("orderId");

  function updateParams(mutator: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    mutator(next);
    setParams(next, { replace: true });
  }

  useEffect(() => {
    setTaxRate(gstRate);
  }, [gstRate, setTaxRate]);

  useEffect(() => {
    if (!restaurantId) return;

    const categoriesQ = query(
      collection(db, "categories"),
      where("restaurantId", "==", restaurantId),
      where("isActive", "==", true)
    );
    const unsubCats = onSnapshot(categoriesQ, (snap) => {
      const next = snap.docs
        .map((d) => {
          const data = d.data() as { name?: unknown; sortOrder?: unknown };
          return {
            id: d.id,
            name: typeof data.name === "string" ? data.name : "Unnamed",
            sortOrder: Number(data.sortOrder ?? 0),
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(next);
      setSelectedCategoryId((current) => current ?? next[0]?.id ?? null);
    });

    const menuQ = query(
      collection(db, "menuItems"),
      where("restaurantId", "==", restaurantId),
      where("isAvailable", "==", true)
    );
    const unsubMenu = onSnapshot(menuQ, (snap) => {
      setMenuItems(
        snap.docs.map((d) => {
          const data = d.data() as {
            name?: unknown;
            price?: unknown;
            categoryId?: unknown;
            vegFlag?: unknown;
            kitchenStation?: unknown;
          };
          return {
            id: d.id,
            name: typeof data.name === "string" ? data.name : "Menu item",
            price: Number(data.price ?? 0),
            categoryId: typeof data.categoryId === "string" ? data.categoryId : "",
            vegFlag: Boolean(data.vegFlag),
            kitchenStation: (typeof data.kitchenStation === "string"
              ? data.kitchenStation
              : "main") as KitchenStation,
          };
        })
      );
    });

    const tablesQ = query(
      collection(db, "tables"),
      where("restaurantId", "==", restaurantId)
    );
    const unsubTables = onSnapshot(tablesQ, (snap) => {
      setTables(
        snap.docs.map((d) => {
          const data = d.data() as { name?: unknown; number?: unknown; status?: unknown };
          return {
            id: d.id,
            name: typeof data.name === "string" ? data.name : "Table",
            number: Number(data.number ?? 0),
            status: typeof data.status === "string" ? data.status : "AVAILABLE",
          };
        })
      );
    });

    return () => {
      unsubCats();
      unsubMenu();
      unsubTables();
    };
  }, [restaurantId, db]);

  const filteredMenuItems = useMemo(() => {
    if (!selectedCategoryId) return menuItems;
    return menuItems.filter((m) => m.categoryId === selectedCategoryId);
  }, [menuItems, selectedCategoryId]);

  const needsTable = orderType === "DINE_IN";

  async function onPlaceOrder() {
    if (auth.status !== "authenticated") return;
    if (!lines.length) return;
    if (needsTable && !selectedTableId) {
      alert("Please select a table for dine-in.");
      return;
    }

    setPlacing(true);
    setOrderPlacedCode(null);
    try {
      const rid = auth.user.restaurant.id;

      // 1) Deduct inventory first (MVP: may need Cloud Function later).
      await deductInventoryForOrder({
        restaurantId: rid,
        orderItems: lines.map((l) => ({
          id: "tmp",
          orderId: "tmp",
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          station: l.station,
        })),
      });

      // 2) Create order + items.
      const orderRef = doc(collection(db, "orders"));
      const orderId = orderRef.id;
      const code = `ORD-${orderId.slice(-6).toUpperCase()}`;

      const batch = writeBatch(db);
      batch.set(orderRef, {
        restaurantId: rid,
        tableId: needsTable ? selectedTableId : undefined,
        orderType,
        status: "OPEN",
        kitchenStatus: "PENDING",
        subtotal,
        tax: taxAmount,
        discount: discountAmount,
        total,
        code,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const l of lines) {
        const itemRef = doc(collection(db, "orderItems"));
        batch.set(itemRef, {
          restaurantId: rid,
          orderId,
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          notes: l.notes?.trim() || undefined,
          addons: [],
          kitchenStatus: "PENDING",
          station: l.station,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (needsTable && selectedTableId) {
        const tableRef = doc(db, "tables", selectedTableId);
        batch.update(tableRef, {
          status: "OCCUPIED",
          currentOrderId: orderId,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      clear();
      setOrderPlacedCode(code);
      const next = new URLSearchParams();
      next.set("orderId", orderId);
      if (selectedTableId) next.set("tableId", selectedTableId);
      nav(`/pos?${next.toString()}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to place order.";
      alert(message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xl font-semibold tracking-tight">POS</div>
          {orderPlacedCode ? (
            <div className="text-sm text-emerald-300">
              Order placed: {orderPlacedCode}
            </div>
          ) : (
            <div className="text-sm text-white/60">
              {activeOrderId ? `Active order: ${activeOrderId}` : "Create a new order"}
            </div>
          )}
        </div>

        <OrcaCard className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-white/70">Order type</div>
            <div className="flex rounded-xl bg-white/5 p-1">
              {(["DINE_IN", "TAKEAWAY", "DELIVERY"] as OrderType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={orderType === t}
                  onClick={() => {
                    setOrderType(t);
                    if (t !== "DINE_IN") {
                      updateParams((p) => p.delete("tableId"));
                    }
                  }}
                  className={`px-3 py-2 text-sm rounded-lg ${
                    orderType === t ? "bg-orange-500 text-black" : "text-white/70 hover:text-white"
                  }`}
                >
                  {t === "DINE_IN" ? "Dine in" : t === "TAKEAWAY" ? "Takeaway" : "Delivery"}
                </button>
              ))}
            </div>

            {needsTable ? (
              <div className="ml-auto min-w-[240px]">
                <label className="block text-xs text-white/70 mb-1">Table</label>
                <select
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
                  value={selectedTableId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value || "";
                    updateParams((p) => {
                      if (value) p.set("tableId", value);
                      else p.delete("tableId");
                    });
                    setOrderType("DINE_IN");
                  }}
                >
                  <option value="">Select a table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (#{t.number})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </OrcaCard>

        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <OrcaCard className="p-3">
            <div className="text-sm font-medium mb-2">Categories</div>
            <div className="space-y-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    selectedCategoryId === c.id
                      ? "border-orange-500/40 bg-orange-500/15"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </OrcaCard>

          <OrcaCard className="p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Menu</div>
              <div className="text-xs text-white/60">
                Tap to add to cart
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMenuItems.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    addMenuItem({
                      menuItemId: m.id,
                      name: m.name,
                      unitPrice: m.price,
                      station: m.kitchenStation,
                      notes: "",
                    })
                  }
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 active:scale-[0.99] transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-sm text-white/70">₹{m.price.toFixed(0)}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-white/60">Station: {m.kitchenStation}</span>
                    {m.vegFlag ? (
                      <span className="text-xs text-emerald-300">Veg</span>
                    ) : (
                      <span className="text-xs text-rose-300">Non-veg</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </OrcaCard>
        </div>
      </div>

      <div className="space-y-4">
        <OrcaCard className="p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm font-medium">Cart</div>
            <OrcaButton variant="secondary" onClick={clear} disabled={!lines.length}>
              Clear
            </OrcaButton>
          </div>

          {lines.length ? (
            <div className="space-y-3">
              <div className="text-xs text-white/60">
                Discount applies on subtotal
              </div>

              <div>
                <label className="block text-xs text-white/70 mb-1">
                  Discount ({discountPercent}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                {lines.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-xs text-white/60">
                          ₹{l.unitPrice.toFixed(0)} • {l.station}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-white/50 hover:text-white"
                        onClick={() => removeLine(l.id)}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLineQuantity(l.id, l.quantity - 1)}
                          className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                        >
                          -
                        </button>
                        <div className="w-8 text-center text-sm">{l.quantity}</div>
                        <button
                          type="button"
                          onClick={() => setLineQuantity(l.id, l.quantity + 1)}
                          className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-sm font-medium">
                        ₹{(l.unitPrice * l.quantity).toFixed(0)}
                      </div>
                    </div>

                    <div className="mt-2">
                      <OrcaInput
                        label="Notes"
                        value={l.notes ?? ""}
                        onChange={(e) => setLineNotes(l.id, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-white/60">Cart is empty. Add items from the menu.</div>
          )}
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="space-y-2 text-sm">
            <Row label="Subtotal" value={`₹${subtotal.toFixed(0)}`} />
            <Row
              label={`Discount`}
              value={`-₹${discountAmount.toFixed(0)}`}
            />
            <Row label="Tax" value={`₹${taxAmount.toFixed(0)}`} />
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <div className="font-semibold">Total</div>
              <div className="text-lg font-bold text-orange-500">
                ₹{total.toFixed(0)}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <OrcaButton
              onClick={onPlaceOrder}
              disabled={!lines.length || placing}
              className="w-full"
            >
              {placing ? "Placing..." : "Place Order"}
            </OrcaButton>
          </div>
        </OrcaCard>
      </div>
    </div>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-white/70">{props.label}</div>
      <div className="text-white/90 font-medium">{props.value}</div>
    </div>
  );
}
