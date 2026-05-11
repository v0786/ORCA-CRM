import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getFirebaseServices } from "../../../../shared/firebase/config";
import { useAuth } from "../../../../shared/hooks/useAuth";
import OrcaCard from "../../../../shared/components/OrcaCard";
import OrcaBadge from "../../../../shared/components/OrcaBadge";

export default function DashboardPage() {
  const auth = useAuth();
  const { db } = getFirebaseServices();
  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;

  const [activeOrders, setActiveOrders] = useState(0);
  const [tablesOccupied, setTablesOccupied] = useState(0);
  const [kitchenLoad, setKitchenLoad] = useState(0);

  const [todaySales, setTodaySales] = useState(0);
  const [yesterdaySales, setYesterdaySales] = useState(0);

  const dateRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const yStart = new Date(start);
    yStart.setDate(yStart.getDate() - 1);
    const yEnd = new Date(end);
    yEnd.setDate(yEnd.getDate() - 1);

    return { start, end, yStart, yEnd };
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    const activeOrdersQ = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "OPEN")
    );
    const unsubActive = onSnapshot(activeOrdersQ, (snap) => {
      setActiveOrders(snap.size);
    });

    const tablesQ = query(
      collection(db, "tables"),
      where("restaurantId", "==", restaurantId),
      where("status", "in", ["OCCUPIED", "BILL_REQUESTED"])
    );
    const unsubTables = onSnapshot(tablesQ, (snap) => {
      setTablesOccupied(snap.size);
    });

    const kitchenQ = query(
      collection(db, "orderItems"),
      where("restaurantId", "==", restaurantId),
      where("kitchenStatus", "in", ["PENDING", "PREPARING"])
    );
    const unsubKitchen = onSnapshot(kitchenQ, (snap) => {
      setKitchenLoad(snap.size);
    });

    // Today + yesterday sales (MVP: client sum)
    const todayQ = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "CLOSED"),
      where("createdAt", ">=", dateRange.start),
      where("createdAt", "<", dateRange.end)
    );
    const unsubToday = onSnapshot(todayQ, (snap) => {
      let sum = 0;
      snap.forEach((d) => {
        const data = d.data() as { total?: unknown };
        sum += Number(data.total ?? 0);
      });
      setTodaySales(sum);
    });

    const yQ = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "CLOSED"),
      where("createdAt", ">=", dateRange.yStart),
      where("createdAt", "<", dateRange.yEnd)
    );
    const unsubY = onSnapshot(yQ, (snap) => {
      let sum = 0;
      snap.forEach((d) => {
        const data = d.data() as { total?: unknown };
        sum += Number(data.total ?? 0);
      });
      setYesterdaySales(sum);
    });

    return () => {
      unsubActive();
      unsubTables();
      unsubKitchen();
      unsubToday();
      unsubY();
    };
  }, [restaurantId, db, dateRange]);

  const growth = useMemo(() => {
    if (!yesterdaySales) return null;
    return ((todaySales - yesterdaySales) / yesterdaySales) * 100;
  }, [todaySales, yesterdaySales]);

  if (auth.status !== "authenticated") {
    return <div className="text-white/70 p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Dashboard</div>
          <div className="text-sm text-white/70 mt-1">
            Live stats for today
          </div>
        </div>
        <div className="flex items-center gap-2">
          {growth == null ? null : (
            <OrcaBadge tone={growth >= 0 ? "green" : "red"}>
              {growth >= 0 ? "+" : ""}
              {growth.toFixed(1)}%
            </OrcaBadge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OrcaCard className="p-4">
          <div className="text-sm text-white/70">Today&apos;s Sales</div>
          <div className="mt-2 text-3xl font-semibold">₹{todaySales.toFixed(0)}</div>
          <div className="mt-2 text-xs text-white/60">
            Yesterday: ₹{yesterdaySales.toFixed(0)}
          </div>
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="text-sm text-white/70">Active Orders</div>
          <div className="mt-2 text-3xl font-semibold">{activeOrders}</div>
          <div className="mt-2 text-xs text-white/60">OPEN status</div>
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="text-sm text-white/70">Tables Occupied</div>
          <div className="mt-2 text-3xl font-semibold">{tablesOccupied}</div>
          <div className="mt-2 text-xs text-white/60">OCCUPIED + BILL_REQUESTED</div>
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="text-sm text-white/70">Kitchen Load</div>
          <div className="mt-2 text-3xl font-semibold">{kitchenLoad}</div>
          <div className="mt-2 text-xs text-white/60">PENDING + PREPARING items</div>
        </OrcaCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <OrcaCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Sales Graph</div>
            <div className="text-xs text-white/60">MVP placeholder</div>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <div className="w-full bg-white/10 rounded-xl px-3 py-2">
              <div className="text-xs text-white/70">Yesterday</div>
              <div className="text-2xl font-semibold mt-1">
                ₹{yesterdaySales.toFixed(0)}
              </div>
            </div>
            <div className="w-full bg-orange-500/15 rounded-xl px-3 py-2">
              <div className="text-xs text-white/70">Today</div>
              <div className="text-2xl font-semibold mt-1 text-orange-300">
                ₹{todaySales.toFixed(0)}
              </div>
            </div>
          </div>
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="text-sm font-medium">Live Notifications</div>
          <div className="mt-2 text-sm text-white/70">
            Connect KDS to update item statuses in real time.
          </div>
        </OrcaCard>
      </div>
    </div>
  );
}
