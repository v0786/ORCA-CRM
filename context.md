ORCA CRM Architecture & MVP Plan
1. High-level architecture
Monorepo structure
apps/ics: ICS operational dashboard + POS + admin.
apps/kds: KDS kitchen & inventory UI optimized for tablets.
shared/: Cross-app code (Firebase client, types, UI kit, hooks, services).
Core technologies
React + Vite + TypeScript, React Router, TailwindCSS, Framer Motion.
State: Zustand for app/global state, React Query-style patterns via simple hooks for Firestore where helpful.
Backend: Firebase Auth, Firestore, Storage, Hosting (later Functions/Cloud Tasks-compatible architecture).
2. Firebase project & environments
Project setup (new Firebase project)
Create one Firebase project: orca-crm-prod (and optionally orca-crm-dev later).
Enable Authentication, Cloud Firestore, Storage, Hosting.
Web apps & hosting sites
Register two web apps in Firebase console: ics and kds (both use same project).
Configure two Hosting targets:
ics → ics.orcacrm.com.
kds → kds.orcacrm.com.
Use firebase.json rewrites so:
/ and /* on ics site serve the ICS build.
/ and /* on kds site serve the KDS build.
Config management
Create [shared/firebase/config.ts](shared/firebase/config.ts) to export firebaseConfig and initialized app instances (Auth, Firestore, Storage).
Use environment-based configs (e.g. VITE_ORCA_ENV, VITE_FIREBASE_* variables) but keep the plan minimal for MVP.
3. Shared Firebase client & domain model
Shared Firebase module (shared/firebase/)
config.ts: initialize firebaseApp, auth, db, storage using SDK v9 modular APIs.
auth.ts: helpers for signInWithEmailAndPassword, onAuthStateChanged, role fetching, and restaurant context.
firestore.ts: typed wrappers for CRUD, real-time listeners, batched writes, and transactions (for inventory deduction).
types.ts: shared TS interfaces for Restaurant, User, Role, Order, OrderItem, Table, MenuItem, InventoryItem, etc.
Multi-tenant restaurant scoping
Each document includes restaurantId field.
All queries are filtered on restaurantId for security and performance.
restaurants collection drives restaurant metadata and code-based login.
4. Initial Firestore data model (MVP-focused)
Collections (prioritized for POS↔KDS MVP)
restaurants: basic profile (name, code, gstNumber, timeZone, theme, printerConfig).
users: auth-linked profiles (uid, restaurantId, roles, phone, displayName, isActive).
roles: role definitions per restaurant (name, permissions array grouped by module).
tables: table layout (name, number, capacity, status, currentOrderId, qrCodeSlug).
categories: POS categories (name, sortOrder, isActive).
menuItems: basic menu (categoryId, name, price, vegFlag, variants, addons, isAvailable, imageUrl, kitchenStation).
orders: high-level order docs (tableId, orderType dine/takeaway/delivery, status, totals, createdAt, updatedAt, kitchenStatus, paymentInfo).
orderItems: line items referencing orderId and menuItemId (quantity, unitPrice, notes, addons, kitchenStatus, station).
inventory: stock records per ingredient or item (sku, name, currentQty, unit, reorderLevel).
recipes: mapping menuItemId → ingredient list (ingredientId, qtyPerUnit, unit).
customers: basic CRM (phone, name, loyaltyPoints, lastVisitAt, notes).
Indexes (for fast queries)
Composite indexes on (restaurantId, status, createdAt desc) for orders.
(restaurantId, tableId, status) for active orders per table.
(restaurantId, station, kitchenStatus, createdAt) for KDS queues.
(restaurantId, sku) for inventory.
5. Auth & role-based access
Authentication modes
Email + password login for staff (future: phone/OTP possible).
Required restaurantCode field at login to scope user context.
User context & guards
In shared/hooks/useAuth.ts:
Subscribe to onAuthStateChanged.
Fetch associated users document and roles permissions for the active restaurant.
Expose user, restaurant, permissions, and loading/error state.
Route-level protection
Shared ProtectedRoute component using React Router to guard routes by authentication and optional permission key.
Permission model: strings such as pos:use, tables:manage, kds:view, inventory:edit, etc., checked against the user’s role.
Separate kitchen vs admin access
KDS app only allows login for users with kds:view permission and automatically navigates into KDS screens.
ICS app exposes modules conditionally based on permissions (e.g. only managers see Staff Management, Analytics).
6. ICS app (apps/ics) – MVP scope
Routing structure
/login (public), /forgot-password (public minimal), / → dashboard (protected), /pos, /tables, /menu, /customers, /settings.
Authentication screens
Glassmorphism login screen with fields: email, password, restaurant code.
Forgot password flow using Firebase’s sendPasswordResetEmail.
Dashboard (MVP)
Show cards: Today’s Sales, Active Orders, Tables Occupied, Kitchen Load using Firestore aggregate-like queries (approximate via client queries or Cloud Functions later).
Simple sales line chart for today vs previous day (placeholder computed from orders).
POS system (core of MVP)
Layout: left = categories + menu grid, right = cart.
Features in MVP:
Select order type (dine-in/takeaway/delivery).
Attach to a table (for dine-in) or customer (for delivery) – minimal UI.
Add items, adjust quantity, free-text notes per line.
Compute subtotal, tax, discount, grand total on client.
Place Order writes order + orderItems in a batched Firestore write and sets status = "OPEN", kitchenStatus = "PENDING".
On success, show order code and route to /pos/active-order/:id or back to table view.
Split bill and advanced discount logic can be stubbed as future enhancements; for MVP, allow a single overall discount percentage/amount.
Table management (MVP)
Grid of tables with status color (available/occupied/bill requested).
Clicking a table opens its active order or new order screen.
Merge/transfer is not required for first MVP but design the data model to support a list of tableIds on an order.
Menu management (MVP)
Simple CRUD list of categories and items for managers.
Ability to toggle availability and set veg/non-veg, price, station, and upload an image to Storage.
7. KDS app (apps/kds) – MVP scope
Routing structure
/login (can reuse shared auth screen, but with KDS branding).
/kitchen (default screen) with station filter.
Kitchen display system (core of MVP)
Real-time Firestore listeners on orderItems filtered by restaurantId, station, and kitchenStatus in ["PENDING","PREPARING"].
Display grouped by order, showing table, order type, time since placed.
Actions per item (and optionally per order): Mark Preparing, Mark Ready.
Use batched writes or transactions to update orderItems.kitchenStatus and propagate an aggregate kitchenStatus back to the parent orders doc.
Sound notification when a new order appears in the queue.
Station separation
Station is derived from menuItem.kitchenStation (e.g. pizza, drinks, dessert, main).
KDS users can filter by one station or view all; in future, separate KDS URLs per station.
Tablet-friendly UI
Large cards, big tap targets, minimal chrome.
Dark theme with orange accent for active tickets.
8. Real-time flows (end-to-end POS → KDS)
Order lifecycle
POS places an order (orders + orderItems).
KDS listeners pick up orderItems with kitchenStatus = "PENDING" in real time.
When KDS marks items as PREPARING or READY, ICS POS and table views listen for changes:
Live kitchen status badges on active orders.
Optionally a notification toast when an order transitions to READY.
Inventory deduction (basic MVP)
On Place Order, after creating orders/orderItems, run a Firestore transaction that:
Reads required recipes for each menuItem.
Decrements inventory.currentQty by qtyOrdered * qtyPerUnit.
Fails and shows error if any ingredient would go below zero (simplest form of availability control).
Keep this logic callable from client in MVP (well-guarded via rules) with an explicit TODO to move to Cloud Functions later.
9. Shared UI + UX design system
Design tokens & theming
Tailwind configuration with colors: black, white, gray shades, and orange accent.
Dark mode by default, with glassmorphism cards (blur, semi-transparent backgrounds) for dashboards and POS/KDS cards.
Shared components (shared/components/)
OrcaButton, OrcaCard, OrcaBadge, OrcaInput, OrcaModal, OrcaTable, LayoutShell.
Animations via Framer Motion for page transitions and key interactions (e.g. order card entering, toast notifications).
Responsiveness & PWA-ready structure
KDS layouts optimized for 10–12" tablets (responsive grid, fullscreen mode potential).
Include manifest and basic service worker configuration in both apps later; MVP plan leaves them as a follow-up.
10. Security rules & basic performance
Firestore rules (MVP)
Only authenticated users can read/write.
Scope every document access by request.auth.uid and resource.data.restaurantId.
Restrict writes on sensitive collections (roles, restaurants, settings) to users with admin or manager permission.
For orders and orderItems, allow writes for roles with pos:use (ICS) and kds:update (KDS) and validate allowed status transitions.
For inventory and recipes, allow read to KDS/manager, write to manager/chef roles only.
Indexes & query performance
Define needed composite indexes early as listed above.
Use limit and pagination on historical queries (e.g. KDS history, dashboard analytics) to keep reads efficient.
11. Deployment strategy
Build outputs
ICS: Vite build output in apps/ics/dist.
KDS: Vite build output in apps/kds/dist.
Firebase Hosting configuration
Use firebase.json with two hosting targets (ics, kds), each with its own public path and rewrites to index.html.
Use npm scripts at root: build (build both apps), deploy:ics, deploy:kds (later: firebase deploy --only hosting:ics etc.).
Subdomain mapping
Map ics.orcacrm.com → ics hosting site.
Map kds.orcacrm.com → kds hosting site.
12. Future-ready considerations
AI, WhatsApp, and multi-branch
Reserve fields like branchId on most collections to extend to multi-branch later.
Keep order and sales schemas flexible so they can feed ML pipelines for AI sales prediction.
Use customers and notifications collections in a way compatible with WhatsApp integration (e.g. store whatsappOptIn, last contact).
Cloud Functions migration path
Inventory deduction, sales aggregation, notifications, and QR ordering webhooks will be easy to move to Functions later by centralizing logic in shared/services/ and referencing it from both client and server where possible.
13. MVP implementation roadmap (phased)
Phase 1 – Foundation
Set up Firebase project, shared config, Firestore rules skeleton, and types.
Implement auth + role model and ProtectedRoute in both apps.
Phase 2 – POS + basic menu/tables (ICS)
Implement menu, tables, POS cart, order creation flow.
Wire inventory deduction transaction at order placement.
Phase 3 – KDS real-time boards
Implement station-based KDS listener and UI.
Wire status updates and real-time feedback into ICS views.
Phase 4 – Hardening & deployment
Add indexes, polish UI, test permissions, and configure Firebase Hosting to deploy to ics.orcacrm.com and kds.orcacrm.com.
