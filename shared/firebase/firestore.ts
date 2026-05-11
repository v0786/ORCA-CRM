import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Query,
  type Unsubscribe,
  type DocumentData,
  type Firestore,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";

import { getFirebaseServices } from "./config";
import type { InventoryItem, OrderItem, Recipe } from "./types";

export function toDate(input: unknown): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input === "object" && input && "toDate" in (input as any)) {
    try {
      return (input as Timestamp).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

export function withUpdatedAt() {
  return { updatedAt: serverTimestamp() };
}

export function buildRestaurantQuery<T = DocumentData>(
  db: Firestore,
  path: string,
  filters: Array<[string, any]>,
  extra?: (q: Query<T>) => Query<T>
): Query<T> {
  // filters = [[field, value], ...] for the MVP; keep it simple.
  const col = collection(db, path) as any as ReturnType<typeof query> & Query<T>;
  let q = query(col, ...filters.map(([field, value]) => where(field, "==", value)));
  if (extra) q = extra(q);
  return q;
}

export function listenQuery<T = DocumentData>(
  q: Query<T>,
  onChange: (docs: Array<{ id: string; data: T }>) => void
): Unsubscribe {
  return onSnapshot(q, (snap) => {
    const results: Array<{ id: string; data: T }> = [];
    snap.forEach((d) => results.push({ id: d.id, data: d.data() }));
    onChange(results);
  });
}

export async function getQueryDocs<T = DocumentData>(
  q: Query<T>
): Promise<Array<{ id: string; data: T }>> {
  const snap = await getDocs(q);
  const results: Array<{ id: string; data: T }> = [];
  snap.forEach((d) => results.push({ id: d.id, data: d.data() }));
  return results;
}

export async function getDocById<T = DocumentData>(
  path: string,
  id: string
): Promise<{ id: string; data: T } | null> {
  const ref = doc(getFirebaseServices().db, path, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, data: snap.data() as T };
}

/**
 * Inventory deduction helper for the MVP.
 *
 * Assumptions (document structure):
 * - `recipes` have: { restaurantId, menuItemId, ingredientId, qtyPerUnit, unit }
 * - `inventory` document id equals `ingredientId` and contains:
 *   { restaurantId, ingredientId, currentQty, unit, sku, name, reorderLevel }
 *
 * If your schema differs, update this function accordingly (later we can move
 * this logic into a Cloud Function for stronger guarantees).
 */
export async function deductInventoryForOrder(args: {
  restaurantId: string;
  orderItems: Array<
    Pick<OrderItem, "menuItemId" | "quantity" | "station"> & { id: string; orderId: string }
  >;
}): Promise<void> {
  const { db } = getFirebaseServices();

  // First pass (outside transaction): compute required inventory deltas.
  // This avoids using `tx.get(query)` which is not typed in the Firebase SDK.
  const ingredientDeltas = new Map<string, number>(); // ingredientId => deltaQty (negative)

  for (const item of args.orderItems) {
    const recipesQ = query(
      collection(db, "recipes"),
      where("restaurantId", "==", args.restaurantId),
      where("menuItemId", "==", item.menuItemId)
    ) as any as Query<Recipe>;

    const recipesSnap = await getDocs(recipesQ);
    recipesSnap.forEach((r: any) => {
      const recipe = r.data() as any as Recipe;
      const ingredientId = recipe.ingredientId as string;
      const requiredQty = (item.quantity ?? 0) * (recipe.qtyPerUnit ?? 0);
      ingredientDeltas.set(
        ingredientId,
        (ingredientDeltas.get(ingredientId) ?? 0) - requiredQty
      );
    });
  }

  // Second pass (transaction): apply deltas with bounds-check.
  await runTransaction(db, async (tx) => {
    for (const [ingredientId, delta] of ingredientDeltas.entries()) {
      if (!ingredientId) continue;
      const invRef = doc(db, "inventory", ingredientId);
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) {
        throw new Error(`Inventory missing for ingredient ${ingredientId}`);
      }
      const inv = invSnap.data() as any as InventoryItem;
      const nextQty = (inv.currentQty ?? 0) + delta;
      if (nextQty < 0) {
        throw new Error(`Insufficient stock for ${inv.name ?? ingredientId}`);
      }
      tx.update(invRef, {
        currentQty: nextQty,
        updatedAt: serverTimestamp(),
      } as any);
    }
  });
}

export async function createDocWithTimestamps<T extends Record<string, any>>(args: {
  collectionPath: string;
  id: string;
  data: T;
}): Promise<void> {
  const { db } = getFirebaseServices();
  const ref = doc(db, args.collectionPath, args.id);
  await setDoc(ref, {
    ...args.data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any);
}

export async function updateDocWithUpdatedAt<T extends Record<string, any>>(args: {
  collectionPath: string;
  id: string;
  data: Partial<T>;
}): Promise<void> {
  const { db } = getFirebaseServices();
  const ref = doc(db, args.collectionPath, args.id);
  await updateDoc(ref, {
    ...args.data,
    updatedAt: serverTimestamp(),
  } as any);
}

export async function commitBatch(ops: {
  collectionPath: string;
  id: string;
  data: Record<string, any>;
}[]): Promise<void> {
  const { db } = getFirebaseServices();
  const batch = writeBatch(db);
  for (const op of ops) {
    const ref = doc(db, op.collectionPath, op.id);
    batch.set(ref, { ...op.data, updatedAt: serverTimestamp() } as any);
  }
  await batch.commit();
}

