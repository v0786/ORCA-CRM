import { useSyncExternalStore } from "react";
import type { OrcaUserContext } from "../firebase/auth";
import { subscribeToUserContext } from "../firebase/auth";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: OrcaUserContext }
  | { status: "unauthenticated"; user: null; error?: string };

let currentState: AuthState = { status: "loading", user: null };
let unsubscribeUserContext: (() => void) | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((l) => l());
}

function ensureSubscribed() {
  if (unsubscribeUserContext) return;
  unsubscribeUserContext = subscribeToUserContext((ctx) => {
    currentState = ctx
      ? { status: "authenticated", user: ctx }
      : { status: "unauthenticated", user: null };
    emitChange();
  });
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  ensureSubscribed();

  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && unsubscribeUserContext) {
      unsubscribeUserContext();
      unsubscribeUserContext = null;
      currentState = { status: "loading", user: null };
    }
  };
}

function getSnapshot() {
  return currentState;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
