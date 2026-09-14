import type { AuthStorage } from './engine';
const unavailable = async (): Promise<never> => { throw new Error('MOBILE_AUTH_REQUIRED'); };
// The browser preview must never downgrade device keys to localStorage.
export const authStorage: AuthStorage = {
  readPublic: async () => null, writePublic: unavailable, readSecret: unavailable, writeSecret: unavailable,
};
