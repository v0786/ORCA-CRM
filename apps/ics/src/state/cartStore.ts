import { create } from "zustand";

export type CartLine = {
  id: string; // line id
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  station: "pizza" | "drinks" | "dessert" | "main";
};

type CartState = {
  lines: CartLine[];
  discountPercent: number;
  taxRate: number;

  setDiscountPercent: (value: number) => void;
  setTaxRate: (value: number) => void;
  addMenuItem: (item: Omit<CartLine, "quantity" | "id">, quantity?: number) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  setLineNotes: (lineId: string, notes: string) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;

  subtotal: () => number;
  discountAmount: () => number;
  taxAmount: () => number;
  total: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  discountPercent: 0,
  taxRate: 0,

  setDiscountPercent: (value) => set({ discountPercent: Math.max(0, Math.min(100, value)) }),
  setTaxRate: (value) => set({ taxRate: Math.max(0, value) }),

  addMenuItem: (item, quantity = 1) =>
    set((state) => {
      const existing = state.lines.find((l) => l.menuItemId === item.menuItemId && l.station === item.station && (l.notes ?? "") === (item.notes ?? ""));
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.id === existing.id ? { ...l, quantity: l.quantity + quantity } : l
          ),
        };
      }
      const lineId = `line_${crypto.randomUUID()}`;
      return {
        lines: [
          ...state.lines,
          { ...item, quantity, id: lineId, notes: item.notes ?? "" },
        ],
      };
    }),

  setLineQuantity: (lineId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { lines: state.lines.filter((l) => l.id !== lineId) };
      return { lines: state.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)) };
    }),

  setLineNotes: (lineId, notes) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.id === lineId ? { ...l, notes } : l)),
    })),

  removeLine: (lineId) => set((state) => ({ lines: state.lines.filter((l) => l.id !== lineId) })),
  clear: () => set({ lines: [], discountPercent: 0, taxRate: 0 }),

  subtotal: () => get().lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),

  discountAmount: () => {
    const sub = get().subtotal();
    const d = sub * (get().discountPercent / 100);
    return Number.isFinite(d) ? d : 0;
  },

  taxAmount: () => {
    const sub = get().subtotal();
    const tax = sub * (get().taxRate / 100);
    return Number.isFinite(tax) ? tax : 0;
  },

  total: () => {
    const sub = get().subtotal();
    const discount = get().discountAmount();
    const tax = sub * (get().taxRate / 100);
    return Math.max(0, sub - discount + tax);
  },
}));

