import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

initializeApp();

type UserDoc = {
  restaurantId?: string;
  permissions?: string[];
};

type RestaurantDoc = {
  logoStoragePath?: string;
};

type UploadLogoRequest = {
  restaurantId?: string;
  contentType?: string;
  dataUrl?: string;
};

function assertAllowedContentType(contentType: string) {
  const allowed = ["image/png", "image/jpeg", "image/svg+xml"];
  if (!allowed.includes(contentType)) {
    throw new HttpsError("invalid-argument", "Only PNG, JPG, or SVG are allowed.");
  }
}

function decodeDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new HttpsError("invalid-argument", "Invalid dataUrl.");
  const [, contentType, b64] = match;
  const buf = Buffer.from(b64, "base64");
  return { contentType, buf };
}

export const uploadRestaurantLogo = onCall({ cors: true }, async (req) => {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Authentication required.");

  const data = (req.data ?? {}) as UploadLogoRequest;
  const restaurantId = typeof data.restaurantId === "string" ? data.restaurantId : "";
  const contentType = typeof data.contentType === "string" ? data.contentType : "";
  const dataUrl = typeof data.dataUrl === "string" ? data.dataUrl : "";

  if (!restaurantId) throw new HttpsError("invalid-argument", "Missing restaurantId.");
  if (!contentType) throw new HttpsError("invalid-argument", "Missing contentType.");
  if (!dataUrl) throw new HttpsError("invalid-argument", "Missing dataUrl.");
  assertAllowedContentType(contentType);

  const decoded = decodeDataUrl(dataUrl);
  if (decoded.contentType !== contentType) {
    throw new HttpsError("invalid-argument", "contentType mismatch.");
  }
  if (decoded.buf.byteLength > 2 * 1024 * 1024) {
    throw new HttpsError("invalid-argument", "Max file size is 2MB.");
  }

  const db = getFirestore();
  const userSnap = await db.doc(`users/${auth.uid}`).get();
  if (!userSnap.exists) throw new HttpsError("permission-denied", "User profile not found.");
  const user = userSnap.data() as UserDoc;
  if (user.restaurantId !== restaurantId) {
    throw new HttpsError("permission-denied", "Restaurant mismatch.");
  }
  const perms = Array.isArray(user.permissions) ? user.permissions : [];
  if (!perms.includes("settings:edit")) {
    throw new HttpsError("permission-denied", "Missing permission settings:edit.");
  }

  const restaurantRef = db.doc(`restaurants/${restaurantId}`);
  const restaurantSnap = await restaurantRef.get();
  if (!restaurantSnap.exists) throw new HttpsError("not-found", "Restaurant not found.");
  const restaurant = restaurantSnap.data() as RestaurantDoc;

  const storage = getStorage();
  const bucket = storage.bucket();

  const ext =
    contentType === "image/svg+xml"
      ? "svg"
      : contentType === "image/jpeg"
        ? "jpg"
        : "png";
  const path = `restaurantLogos/${restaurantId}/logo_${Date.now()}.${ext}`;

  await bucket.file(path).save(decoded.buf, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=3600",
    },
  });

  await restaurantRef.update({
    logoStoragePath: path,
    logoUpdatedAt: new Date(),
  });

  if (restaurant.logoStoragePath && restaurant.logoStoragePath !== path) {
    await bucket.file(restaurant.logoStoragePath).delete({ ignoreNotFound: true }).catch(() => {});
  }

  return { logoStoragePath: path };
});

