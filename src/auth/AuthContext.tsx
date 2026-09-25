import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { localAuth } from './runtime';
import type { AuthSnapshot } from './engine';

type Value = AuthSnapshot & { ready: boolean; error: string | null; refresh: () => void; lock: () => void; retry: () => void };
const Context = createContext<Value | null>(null);
export function AuthProvider({ children }: React.PropsWithChildren) {
  const [snapshot, setSnapshot] = useState(localAuth.snapshot());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => setSnapshot(localAuth.snapshot()), []);
  const lock = useCallback(() => { localAuth.lock(); refresh(); }, [refresh]);
  const retry = useCallback(() => {
    setError(null); setReady(false);
    void localAuth.initialize().then(refresh).catch((e: Error) => setError(e.message)).finally(() => setReady(true));
  }, [refresh]);
  // Keep the in-memory session during app switching. A fresh app runtime starts
  // locked through initialize(); explicit logout still calls lock().
  useEffect(retry, [retry]);
  return <Context.Provider value={{ ...snapshot, ready, error, refresh, lock, retry }}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
