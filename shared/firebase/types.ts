export type RoleKey =
  | "admin"
  | "manager"
  | "cashier"
  | "server"
  | "kitchen"
  | "inventory";

export type PermissionKey =
  | "pos:use"
  | "tables:manage"
  | "menu:edit"
  | "customers:view"
  | "staff:manage"
  | "analytics:view"
  | "settings:edit"
  | "kds:view"
  | "kds:update"
  | "inventory:view"
  | "inventory:edit";

export interface Restaurant {
  id: string;
  code: string;
  name: string;
  gstNumber?: string;
  gstRate?: number;
  timeZone?: string;
  theme?: "light" | "dark";
  logoStoragePath?: string;
  logoUpdatedAt?: unknown;
}

export interface Role {
  id: string;
  restaurantId: string;
  name: string;
  permissions: PermissionKey[];
}

export interface UserProfile {
  id: string;
  uid: string;
  restaurantId: string;
  roleIds: string[];
  permissions?: PermissionKey[];
  displayName: string;
  email?: string;
  phone?: string;
  isActive: boolean;
}

export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";

export type KitchenStatus = "PENDING" | "PREPARING" | "READY" | "SERVED";

export interface Table {
  id: string;
  restaurantId: string;
  name: string;
  number: number;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "BILL_REQUESTED";
  currentOrderId?: string;
  qrCodeSlug?: string;
}

export interface Category {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export type KitchenStation = "pizza" | "drinks" | "dessert" | "main";

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  vegFlag: boolean;
  variants?: { name: string; priceDelta: number }[];
  addons?: { name: string; price: number }[];
  isAvailable: boolean;
  imageUrl?: string;
  kitchenStation: KitchenStation;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId?: string;
  customerId?: string;
  orderType: OrderType;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  kitchenStatus: KitchenStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  restaurantId: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  addons?: { name: string; price: number }[];
  kitchenStatus: KitchenStatus;
  station: KitchenStation;
}

// Inventory + recipe mapping (used for POS->inventory deduction MVP)
export interface InventoryItem {
  id: string;
  restaurantId: string;
  ingredientId: string;
  sku: string;
  name: string;
  currentQty: number;
  unit: string;
  reorderLevel: number;
}

export interface Ingredient {
  id: string;
  restaurantId: string;
  name: string;
  unit: string;
}

export interface Recipe {
  id: string;
  restaurantId: string;
  menuItemId: string;
  ingredientId: string;
  qtyPerUnit: number;
  unit: string;
}
