import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { getFirebaseServices } from "../../../../shared/firebase/config";
import { useAuth } from "../../../../shared/hooks/useAuth";
import OrcaBadge from "../../../../shared/components/OrcaBadge";
import OrcaCard from "../../../../shared/components/OrcaCard";

type OpenOrderInfo = {
  orderId: string;
  code?: string;
  kitchenStatus?: string;
};

export default function TablesPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { db } = getFirebaseServices();
  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;

  const [tables, setTables] = useState<
    Array<{ id: string; name: string; number: number; status: string }>
  >([]);
  const [openByTableId, setOpenByTableId] = useState<Record<string, OpenOrderInfo>>(
    {}
  );

  useEffect(() => {
    if (!restaurantId) return;

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

    const openOrdersQ = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "OPEN")
    );
    const unsubOrders = onSnapshot(openOrdersQ, (snap) => {
      const map: Record<string, OpenOrderInfo> = {};
      snap.forEach((d) => {
        const data = d.data() as { tableId?: unknown; code?: unknown; kitchenStatus?: unknown };
        const tableId = typeof data.tableId === "string" ? data.tableId : "";
        if (!tableId) return;
        map[tableId] = {
          orderId: d.id,
          code: typeof data.code === "string" ? data.code : undefined,
          kitchenStatus: typeof data.kitchenStatus === "string" ? data.kitchenStatus : undefined,
        };
      });
      setOpenByTableId(map);
    });

    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [restaurantId, db]);

  const tableTone = useMemo(() => {
    return (status: string): "green" | "orange" | "gray" => {
      if (status === "AVAILABLE") return "green";
      if (status === "BILL_REQUESTED") return "orange";
      if (status === "OCCUPIED") return "orange";
      return "gray";
    };
  }, []);

  if (auth.status !== "authenticated") {
    return <div className="text-white/70 p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Tables</div>
          <div className="text-sm text-white/70 mt-1">Tap a table to open POS</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => {
          const open = openByTableId[t.id];
          const tone = tableTone(t.status);
          return (
            <OrcaCard key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{t.name}</div>
                  <div className="text-xs text-white/60">Table #{t.number}</div>
                </div>
                <OrcaBadge tone={tone}>
                  {t.status}
                </OrcaBadge>
              </div>

              {open ? (
                <div className="mt-3 space-y-1">
                  <div className="text-sm text-white/70">
                    Open: {open.code ?? open.orderId}
                  </div>
                  <div className="text-xs text-white/60">
                    Kitchen: {open.kitchenStatus ?? "—"}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/60">No active order</div>
              )}

              <div className="mt-4">
                <button
                  type="button"
                  className="w-full rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-black hover:bg-orange-400"
                  onClick={() => nav(`/pos?tableId=${t.id}`)}
                >
                  {open ? "Continue order" : "New order"}
                </button>
              </div>
            </OrcaCard>
          );
        })}
      </div>
    </div>
  );
}
