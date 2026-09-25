import * as Crypto from 'expo-crypto';
import { LocalAuth } from './engine';
import { authStorage } from './nativeStorage';

export const localAuth = new LocalAuth(authStorage, (length) => Crypto.getRandomValues(new Uint8Array(length)));
