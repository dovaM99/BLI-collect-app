import type { AuthStorage } from './engine';

// Aperçu Web : comptes en mémoire seulement, perdus au rechargement de la page.
const memory = new Map<string, string>();
export const authStorage: AuthStorage = {
  readPublic: async () => memory.get('public') ?? null,
  writePublic: async (value) => { memory.set('public', value); },
  readLegacy: async () => null,
  readSecret: async (code) => memory.get(`pin.${code}`) ?? null,
  writeSecret: async (code, value) => { memory.set(`pin.${code}`, value); },
};
