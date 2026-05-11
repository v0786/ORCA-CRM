import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getFirebaseServices } from "../../../../shared/firebase/config";
import { useAuth } from "../../../../shared/hooks/useAuth";
import OrcaCard from "../../../../shared/components/OrcaCard";
import OrcaButton from "../../../../shared/components/OrcaButton";
import OrcaBadge from "../../../../shared/components/OrcaBadge";
import type { KitchenStation } from "../../../../shared/firebase/types";
import { toDate } from "../../../../shared/firebase/firestore";

type QueueOrder = {
  orderId: string;
  tableId?: string;
  orderType?: string;
  code?: string;
  createdAtMs?: number;
  items: Array<{
    itemId: string; // orderItems doc id
    menuItemId: string;
    quantity: number;
    kitchenStatus: "PENDING" | "PREPARING" | "READY";
    station: KitchenStation;
  }>;
};

const stations: Array<KitchenStation> = ["pizza", "drinks", "dessert", "main"];

function playBeep() {
  try {
    const AudioContextImpl =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextImpl) return;
    const ctx = new AudioContextImpl();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close().catch(() => {});
    }, 120);
  } catch {
    // No-op (audio permissions / unsupported browsers).
  }
}

export default function KitchenPage() {
  const auth = useAuth();
  const { db } = getFirebaseServices();
  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;

  const [station, setStation] = useState<KitchenStation | "all">("all");

  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [menuItemNameById, setMenuItemNameById] = useState<Record<string, string>>({});
  const seenOrderIdsRef = useRef<Set<string>>(new Set());

  const kdsItemsQuery = useMemo(() => {
    if (!restaurantId) return null;
    const baseFilters: QueryConstraint[] = [
      where("restaurantId", "==", restaurantId),
      where("kitchenStatus", "in", ["PENDING", "PREPARING"]),
    ];
    if (station !== "all") {
      baseFilters.push(where("station", "==", station));
    }
    return query(collection(db, "orderItems"), ...baseFilters);
  }, [restaurantId, db, station]);

  useEffect(() => {
    if (!restaurantId || !kdsItemsQuery) return;

    const unsubItems = onSnapshot(kdsItemsQuery, async (snap) => {
      const byOrder: Record<string, QueueOrder> = {};

      const incomingOrderIds: string[] = [];
      const incomingMenuItemIds: string[] = [];

      snap.forEach((d) => {
        const data = d.data() as {
          orderId?: unknown;
          menuItemId?: unknown;
          quantity?: unknown;
          kitchenStatus?: unknown;
          station?: unknown;
        };
        const orderId = typeof data.orderId === "string" ? data.orderId : "";
        if (!orderId) return;
        if (!byOrder[orderId]) {
          byOrder[orderId] = {
            orderId,
            items: [],
          };
          incomingOrderIds.push(orderId);
        }
        const menuItemId = typeof data.menuItemId === "string" ? data.menuItemId : "";
        if (menuItemId) incomingMenuItemIds.push(menuItemId);
        const kitchenStatus = (typeof data.kitchenStatus === "string"
          ? data.kitchenStatus
          : "PENDING") as QueueOrder["items"][number]["kitchenStatus"];
        const stationValue = (typeof data.station === "string"
          ? data.station
          : "main") as KitchenStation;
        byOrder[orderId].items.push({
          itemId: d.id,
          menuItemId,
          quantity: Number(data.quantity ?? 1),
          kitchenStatus,
          station: stationValue,
        });
      });

      // Sound notification: detect newly seen order IDs.
      const nextSeen = new Set(seenOrderIdsRef.current);
      let shouldBeep = false;
      for (const oid of incomingOrderIds) {
        if (!nextSeen.has(oid)) shouldBeep = true;
        nextSeen.add(oid);
      }
      seenOrderIdsRef.current = nextSeen;
      if (shouldBeep) playBeep();

      const orderIds = Object.keys(byOrder);
      if (orderIds.length) {
        // Fetch parent order metadata (code/table/orderType/createdAt).
        // Firestore 'in' limit is 10, so chunk.
        const chunks: string[][] = [];
        for (let i = 0; i < orderIds.length; i += 10) {
          chunks.push(orderIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const ordersQ = query(
            collection(db, "orders"),
            where("restaurantId", "==", restaurantId),
            where(documentId(), "in", chunk)
          );
          const orderSnaps = await getDocs(ordersQ);
          orderSnaps.forEach((od) => {
            const data = od.data() as {
              tableId?: unknown;
              orderType?: unknown;
              code?: unknown;
              createdAt?: unknown;
            };
            const q = byOrder[od.id];
            if (!q) return;
            q.tableId = typeof data.tableId === "string" ? data.tableId : undefined;
            q.orderType = typeof data.orderType === "string" ? data.orderType : undefined;
            q.code = typeof data.code === "string" ? data.code : undefined;
            const createdAt = toDate(data.createdAt);
            q.createdAtMs = createdAt ? createdAt.getTime() : undefined;
          });
        }
      }

      const uniqueMenuItemIds = Array.from(new Set(incomingMenuItemIds)).filter(Boolean);
      if (uniqueMenuItemIds.length) {
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueMenuItemIds.length; i += 10) {
          chunks.push(uniqueMenuItemIds.slice(i, i + 10));
        }

        const nextMap: Record<string, string> = {};
        for (const chunk of chunks) {
          const itemsQ = query(
            collection(db, "menuItems"),
            where("restaurantId", "==", restaurantId),
            where(documentId(), "in", chunk)
          );
          const itemSnaps = await getDocs(itemsQ);
          itemSnaps.forEach((d) => {
            const data = d.data() as { name?: unknown };
            const name = typeof data.name === "string" ? data.name : "";
            if (name) nextMap[d.id] = name;
          });
        }
        setMenuItemNameById(nextMap);
      } else {
        setMenuItemNameById({});
      }

      // Stable ordering: oldest orders first.
      const sorted = Object.values(byOrder).sort((a, b) => {
        const at = a.createdAtMs ?? 0;
        const bt = b.createdAtMs ?? 0;
        return at - bt;
      });

      setOrders(sorted);
    });

    return () => unsubItems();
  }, [restaurantId, kdsItemsQuery, db]);

  function statusTone(
    status: QueueOrder["items"][number]["kitchenStatus"]
  ): "orange" | "green" | "gray" {
    if (status === "PREPARING") return "orange";
    if (status === "READY") return "green";
    return "gray";
  }

  async function updateItemKitchenStatus(itemId: string, orderId: string, next: "PREPARING" | "READY") {
    if (!restaurantId) return;
    await updateDoc(doc(db, "orderItems", itemId), {
      kitchenStatus: next,
      updatedAt: serverTimestamp(),
    });

    // Best-effort: update parent order kitchenStatus based on remaining items.
    const itemsQ = query(
      collection(db, "orderItems"),
      where("restaurantId", "==", restaurantId),
      where("orderId", "==", orderId)
    );
    const itemsSnap = await getDocs(itemsQ);

    let hasPending = false;
    let hasPreparing = false;

    itemsSnap.forEach((d) => {
      const data = d.data() as { kitchenStatus?: unknown };
      const s = typeof data.kitchenStatus === "string" ? data.kitchenStatus : "";
      if (s !== "READY" && s !== "SERVED") hasPending = true;
      if (s === "PREPARING") hasPreparing = true;
    });

    const nextOrderKitchenStatus = hasPending
      ? hasPreparing
        ? "PREPARING"
        : "PENDING"
      : "READY";

    await updateDoc(doc(db, "orders", orderId), {
      kitchenStatus: nextOrderKitchenStatus,
      updatedAt: serverTimestamp(),
    });
  }

  const now = useNowTick(10_000);

  if (auth.status !== "authenticated") {
    return <div className="text-white/70 p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Kitchen</div>
          <div className="text-sm text-white/70 mt-1">
            Real-time queue (MVP)
          </div>
        </div>

        <div className="min-w-[220px]">
          <label className="block text-xs text-white/70 mb-1">
            Station
          </label>
          <select
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
            value={station}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "all") setStation("all");
              else if (stations.includes(value as KitchenStation)) {
                setStation(value as KitchenStation);
              } else {
                setStation("all");
              }
            }}
          >
            <option value="all">All</option>
            {stations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {orders.length ? (
          orders.map((o) => {
            const elapsedMinutes = o.createdAtMs
              ? Math.max(0, Math.floor((now - o.createdAtMs) / 60_000))
              : null;
            return (
              <OrcaCard key={o.orderId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {o.code ? o.code : `Order ${o.orderId}`}
                    </div>
                    <div className="text-sm text-white/60 mt-1">
                      Table: {o.tableId ?? "—"} • {o.orderType ?? "—"}
                    </div>
                    {elapsedMinutes != null ? (
                      <div className="text-xs text-white/60 mt-1">
                        {elapsedMinutes} min since placed
                      </div>
                    ) : null}
                  </div>
                  <OrcaBadge tone="orange">{o.items.length} items</OrcaBadge>
                </div>

                <div className="mt-4 space-y-2">
                  {o.items.map((it) => (
                    <div
                      key={it.itemId}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {menuItemNameById[it.menuItemId] ?? it.menuItemId}
                          </div>
                          <div className="text-xs text-white/60">
                            Qty {it.quantity} • {it.station}
                          </div>
                        </div>
                        <OrcaBadge tone={statusTone(it.kitchenStatus)}>
                          {it.kitchenStatus}
                        </OrcaBadge>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <OrcaButton
                          variant="secondary"
                          disabled={it.kitchenStatus === "PREPARING"}
                          onClick={() =>
                            updateItemKitchenStatus(
                              it.itemId,
                              o.orderId,
                              "PREPARING"
                            )
                          }
                          className="flex-1"
                        >
                          Preparing
                        </OrcaButton>
                        <OrcaButton
                          disabled={it.kitchenStatus === "READY"}
                          onClick={() =>
                            updateItemKitchenStatus(
                              it.itemId,
                              o.orderId,
                              "READY"
                            )
                          }
                          className="flex-1"
                        >
                          Ready
                        </OrcaButton>
                      </div>
                    </div>
                  ))}
                </div>
              </OrcaCard>
            );
          })
        ) : (
          <OrcaCard className="p-8">
            <div className="text-center text-white/70">
              No orders in queue for this station.
            </div>
          </OrcaCard>
        )}
      </div>
    </div>
  );
}

function useNowTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
