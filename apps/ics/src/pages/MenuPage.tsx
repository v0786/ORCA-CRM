import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { getFirebaseServices } from "../../../../shared/firebase/config";
import type { Category, KitchenStation, MenuItem } from "../../../../shared/firebase/types";
import OrcaButton from "../../../../shared/components/OrcaButton";
import OrcaCard from "../../../../shared/components/OrcaCard";
import OrcaInput from "../../../../shared/components/OrcaInput";

type CategoryForm = {
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type MenuItemForm = {
  name: string;
  price: number;
  vegFlag: boolean;
  categoryId: string;
  kitchenStation: KitchenStation;
  isAvailable: boolean;
  imageFile?: File | null;
  imageUrl?: string;
};

export default function MenuPage() {
  const auth = useAuth();
  const { db, storage } = getFirebaseServices();
  const restaurantId = auth.status === "authenticated" ? auth.user.restaurant.id : null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    name: "",
    sortOrder: 0,
    isActive: true,
  });

  const kitchenStations = useMemo<KitchenStation[]>(
    () => ["pizza", "drinks", "dessert", "main"],
    []
  );

  const [menuEditId, setMenuEditId] = useState<string | null>(null);
  const [menuForm, setMenuForm] = useState<MenuItemForm>({
    name: "",
    price: 0,
    vegFlag: true,
    categoryId: "",
    kitchenStation: "main",
    isAvailable: true,
    imageFile: null,
    imageUrl: undefined,
  });

  useEffect(() => {
    if (!restaurantId) return;

    const catsQ = query(
      collection(db, "categories"),
      where("restaurantId", "==", restaurantId),
      orderBy("sortOrder", "asc")
    );
    const unsubCats = onSnapshot(catsQ, (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, "id">) }));
      setCategories(next);
      const firstId = next[0]?.id ?? "";
      if (firstId) {
        setMenuForm((s) => (s.categoryId ? s : { ...s, categoryId: firstId }));
      }
    });

    const itemsQ = query(
      collection(db, "menuItems"),
      where("restaurantId", "==", restaurantId)
    );
    const unsubItems = onSnapshot(itemsQ, (snap) => {
      setMenuItems(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, "id">) }))
      );
    });

    return () => {
      unsubCats();
      unsubItems();
    };
  }, [restaurantId, db]);

  async function saveCategory() {
    if (auth.status !== "authenticated") return;
    const rid = auth.user.restaurant.id;

    const id = categoryEditId ?? doc(collection(db, "categories")).id;
    await setDoc(
      doc(db, "categories", id),
      {
        restaurantId: rid,
        name: categoryForm.name.trim(),
        sortOrder: categoryForm.sortOrder,
        isActive: categoryForm.isActive,
      },
      { merge: true }
    );

    setCategoryEditId(null);
    setCategoryForm({ name: "", sortOrder: 0, isActive: true });
  }

  async function deleteCategory(categoryId: string) {
    if (!confirm("Delete category?")) return;
    await deleteDoc(doc(db, "categories", categoryId));
  }

  async function saveMenuItem() {
    if (auth.status !== "authenticated") return;
    const rid = auth.user.restaurant.id;

    const id = menuEditId ?? doc(collection(db, "menuItems")).id;
    const baseRef = doc(db, "menuItems", id);

    // 1) Save item basics first.
    await setDoc(
      baseRef,
      {
        restaurantId: rid,
        categoryId: menuForm.categoryId,
        name: menuForm.name.trim(),
        price: menuForm.price,
        vegFlag: menuForm.vegFlag,
        isAvailable: menuForm.isAvailable,
        kitchenStation: menuForm.kitchenStation,
        imageUrl: menuForm.imageUrl ?? null,
      },
      { merge: true }
    );

    // 2) Upload image if provided.
    if (menuForm.imageFile) {
      const storageRef = ref(storage, `menuImages/${rid}/${id}.jpg`);
      await uploadBytes(storageRef, menuForm.imageFile);
      const url = await getDownloadURL(storageRef);
      await updateDoc(baseRef, { imageUrl: url, updatedAt: Timestamp.now() });
    }

    setMenuEditId(null);
    setMenuForm({
      name: "",
      price: 0,
      vegFlag: true,
      categoryId: categories[0]?.id ?? "",
      kitchenStation: "main",
      isAvailable: true,
      imageFile: null,
      imageUrl: undefined,
    });
  }

  async function deleteMenuItem(id: string) {
    if (!confirm("Delete menu item?")) return;
    await deleteDoc(doc(db, "menuItems", id));
  }

  function startEditCategory(c: Category) {
    setCategoryEditId(c.id);
    setCategoryForm({
      name: c.name ?? "",
      sortOrder: c.sortOrder ?? 0,
      isActive: c.isActive ?? true,
    });
  }

  function startEditMenuItem(item: MenuItem) {
    setMenuEditId(item.id);
    setMenuForm({
      name: item.name,
      price: item.price,
      vegFlag: item.vegFlag,
      categoryId: item.categoryId,
      kitchenStation: item.kitchenStation,
      isAvailable: item.isAvailable,
      imageFile: null,
      imageUrl: item.imageUrl,
    });
  }

  if (auth.status !== "authenticated") {
    return <div className="text-white/70 p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Menu Management</div>
          <div className="text-sm text-white/70 mt-1">
            Categories and menu items (MVP)
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OrcaCard className="p-4">
          <div className="text-sm font-semibold mb-3">Categories</div>

          <div className="space-y-2">
            <OrcaInput
              label="Name"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((s) => ({ ...s, name: e.target.value }))}
            />
            <OrcaInput
              label="Sort order"
              type="number"
              value={categoryForm.sortOrder}
              onChange={(e) => setCategoryForm((s) => ({ ...s, sortOrder: Number(e.target.value) }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={categoryForm.isActive}
                onChange={(e) => setCategoryForm((s) => ({ ...s, isActive: e.target.checked }))}
              />
              Active
            </label>

            <div className="flex gap-2 pt-1">
              <OrcaButton className="flex-1" onClick={saveCategory}>
                {categoryEditId ? "Save" : "Add"}
              </OrcaButton>
              {categoryEditId ? (
                <OrcaButton
                  variant="secondary"
                  onClick={() => {
                    setCategoryEditId(null);
                    setCategoryForm({ name: "", sortOrder: 0, isActive: true });
                  }}
                >
                  Cancel
                </OrcaButton>
              ) : null}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-white/60">Sort: {c.sortOrder}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs text-white/70 hover:text-white"
                    onClick={() => startEditCategory(c)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-300 hover:text-rose-200"
                    onClick={() => deleteCategory(c.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!categories.length ? (
              <div className="text-sm text-white/60">No categories yet.</div>
            ) : null}
          </div>
        </OrcaCard>

        <OrcaCard className="p-4">
          <div className="text-sm font-semibold mb-3">Menu Items</div>

          <div className="space-y-2">
            <OrcaInput
              label="Name"
              value={menuForm.name}
              onChange={(e) => setMenuForm((s) => ({ ...s, name: e.target.value }))}
            />
            <OrcaInput
              label="Price"
              type="number"
              value={menuForm.price}
              onChange={(e) => setMenuForm((s) => ({ ...s, price: Number(e.target.value) }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={menuForm.vegFlag}
                onChange={(e) => setMenuForm((s) => ({ ...s, vegFlag: e.target.checked }))}
              />
              Veg
            </label>

            <label className="block text-sm">
              <div className="text-xs text-white/70 mb-1">Category</div>
              <select
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
                value={menuForm.categoryId}
                onChange={(e) => setMenuForm((s) => ({ ...s, categoryId: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <div className="text-xs text-white/70 mb-1">Kitchen station</div>
              <select
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
                value={menuForm.kitchenStation}
                onChange={(e) => setMenuForm((s) => ({ ...s, kitchenStation: e.target.value as KitchenStation }))}
              >
                {kitchenStations.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={menuForm.isAvailable}
                onChange={(e) => setMenuForm((s) => ({ ...s, isAvailable: e.target.checked }))}
              />
              Available
            </label>

            <label className="block text-sm">
              <div className="text-xs text-white/70 mb-1">Image (optional)</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0] ?? null;
                  setMenuForm((s) => ({ ...s, imageFile: file }));
                }}
              />
            </label>

            <div className="flex gap-2 pt-1">
              <OrcaButton className="flex-1" onClick={saveMenuItem}>
                {menuEditId ? "Save" : "Add"}
              </OrcaButton>
              {menuEditId ? (
                <OrcaButton
                  variant="secondary"
                  onClick={() => {
                    setMenuEditId(null);
                    setMenuForm({
                      name: "",
                      price: 0,
                      vegFlag: true,
                      categoryId: categories[0]?.id ?? "",
                      kitchenStation: "main",
                      isAvailable: true,
                      imageFile: null,
                      imageUrl: undefined,
                    });
                  }}
                >
                  Cancel
                </OrcaButton>
              ) : null}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
            {menuItems.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-xs text-white/60">
                    ₹{m.price} • {m.kitchenStation} • {m.isAvailable ? "Available" : "Hidden"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs text-white/70 hover:text-white"
                    onClick={() => startEditMenuItem(m)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-300 hover:text-rose-200"
                    onClick={() => deleteMenuItem(m.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!menuItems.length ? (
              <div className="text-sm text-white/60">No items yet.</div>
            ) : null}
          </div>
        </OrcaCard>
      </div>
    </div>
  );
}
