import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  documentId,
  onSnapshot,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseServices } from "./config";
import type { Restaurant, Role, UserProfile } from "./types";

export type OrcaUserContext = {
  firebaseUser: FirebaseUser;
  profile: UserProfile;
  restaurant: Restaurant;
  roles: Role[];
};

export async function loginWithEmailAndRestaurantCode(
  email: string,
  password: string,
  restaurantCode: string
): Promise<OrcaUserContext> {
  const { auth, db } = getFirebaseServices();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = credential.user;

  const restaurantsCol = collection(db, "restaurants").withConverter<Restaurant>({
    toFirestore: (data) => data as any,
    fromFirestore: (snap) => ({ id: snap.id, ...(snap.data() as any) }),
  });

  const restaurantQuery = query(
    restaurantsCol,
    where("code", "==", restaurantCode)
  );

  const restaurantDocs = await getDocs(restaurantQuery);
  if (restaurantDocs.empty) {
    throw new Error("Restaurant code not found");
  }
  const restaurant = restaurantDocs.docs[0].data();

  const userDocRef = doc(db, "users", firebaseUser.uid).withConverter<UserProfile>({
    toFirestore: (data) => data as any,
    fromFirestore: (snap) => ({ id: snap.id, ...(snap.data() as any) }),
  });
  const userSnap = await getDoc(userDocRef);
  if (!userSnap.exists()) {
    throw new Error("User profile not found");
  }
  const profile = userSnap.data();

  if (profile.restaurantId !== restaurant.id) {
    throw new Error("User is not linked to this restaurant");
  }

  const roles: Role[] = [];
  if (profile.roleIds?.length) {
    const rolesCol = collection(db, "roles").withConverter<Role>({
      toFirestore: (data) => data as any,
      fromFirestore: (snap) => ({ id: snap.id, ...(snap.data() as any) }),
    });
    const rolesQuery = query(
      rolesCol,
      where("restaurantId", "==", restaurant.id),
      where(documentId(), "in", profile.roleIds)
    );
    const roleSnaps = await getDocs(rolesQuery);
    roleSnaps.forEach((docSnap) => roles.push(docSnap.data()));
  }

  // Denormalize permissions onto the user doc for Firestore rules.
  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));
  if (permissions.length) {
    await updateDoc(userDocRef, { permissions } as any);
  }

  return {
    firebaseUser,
    profile,
    restaurant,
    roles,
  };
}

export function subscribeToUserContext(
  onChange: (ctx: OrcaUserContext | null) => void
): () => void {
  const { auth, db } = getFirebaseServices();
  let unsubProfile: (() => void) | null = null;
  let unsubRestaurant: (() => void) | null = null;
  let unsubRoles: (() => void) | null = null;

  const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
    if (!firebaseUser) {
      if (unsubProfile) unsubProfile();
      if (unsubRestaurant) unsubRestaurant();
      if (unsubRoles) unsubRoles();
      onChange(null);
      return;
    }

    let profile: UserProfile | null = null;
    let restaurant: Restaurant | null = null;
    let roles: Role[] = [];
    let lastPermissionsHash = "";

    const emit = () => {
      if (!profile || !restaurant) return;
      onChange({ firebaseUser, profile, restaurant, roles });
    };

    const userDocRef = doc(db, "users", firebaseUser.uid);
    unsubProfile = onSnapshot(userDocRef, async (userSnap) => {
      if (!userSnap.exists()) {
        onChange(null);
        return;
      }
      profile = { id: userSnap.id, ...(userSnap.data() as any) } as UserProfile;

      // Subscribe to restaurant doc.
      const restaurantDocRef = doc(db, "restaurants", profile.restaurantId);
      if (unsubRestaurant) unsubRestaurant();
      unsubRestaurant = onSnapshot(restaurantDocRef, async (restaurantSnap) => {
        if (!restaurantSnap.exists()) {
          restaurant = null;
          onChange(null);
          return;
        }
        restaurant = {
          id: restaurantSnap.id,
          ...(restaurantSnap.data() as any),
        } as Restaurant;
        emit();
      });

      // Subscribe to roles for this user profile.
      if (unsubRoles) unsubRoles();
      roles = [];
      if (profile.roleIds?.length) {
        const rolesCol = collection(db, "roles").withConverter<Role>({
          toFirestore: (data) => data as any,
          fromFirestore: (snap) => ({ id: snap.id, ...(snap.data() as any) }),
        });
        const rolesQuery = query(
          rolesCol,
          where("restaurantId", "==", profile.restaurantId),
          where(documentId(), "in", profile.roleIds)
        );
        unsubRoles = onSnapshot(rolesQuery, (roleSnaps) => {
          roles = roleSnaps.docs.map((d) => d.data());

          const permissions = Array.from(
            new Set(roles.flatMap((r) => r.permissions))
          );
          const hash = JSON.stringify([...permissions].sort());
          if (permissions.length && hash !== lastPermissionsHash) {
            lastPermissionsHash = hash;
            updateDoc(userDocRef, { permissions } as any).catch(() => {});
          }
          emit();
        });
      } else {
        emit();
      }
    });
  });

  return () => {
    unsubAuth();
    if (unsubProfile) unsubProfile();
    if (unsubRestaurant) unsubRestaurant();
    if (unsubRoles) unsubRoles();
  };
}

export function logout() {
  const { auth } = getFirebaseServices();
  return signOut(auth);
}

export async function forgotPassword(email: string): Promise<void> {
  const { auth } = getFirebaseServices();
  await sendPasswordResetEmail(auth, email);
}

