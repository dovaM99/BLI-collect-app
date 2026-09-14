import * as Crypto from 'expo-crypto';
import { OfflineAuth } from './engine';
import { authStorage } from './nativeStorage';
import issuers from './trusted-issuers.json';
import type { TrustStore } from './protocol';

// getRandomBytes has a Math.random fallback under remote debugging; never use it for keys.
export const offlineAuth = new OfflineAuth(authStorage, issuers as TrustStore, (length) => Crypto.getRandomValues(new Uint8Array(length)));
