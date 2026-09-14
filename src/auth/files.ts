import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { parseDocument, type ActivationRequest } from './protocol';

export async function shareRequest(request: ActivationRequest) {
  const uri = `${FileSystem.cacheDirectory}bli-demande-${request.payload.identity.collectorCode}-${request.payload.requestId.slice(0, 8)}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(request, null, 2));
  if (!(await Sharing.isAvailableAsync())) throw new Error('SHARING_UNAVAILABLE');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Demande d’activation BLI' });
}
export async function pickAuthorization() {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset) return null;
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || (info.size ?? asset.size ?? 0) > 16_384) throw new Error('DOCUMENT_TOO_LARGE');
  return parseDocument(await FileSystem.readAsStringAsync(asset.uri));
}
