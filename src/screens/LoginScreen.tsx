import React, { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useApp } from '../state/AppContext';
import { useAuth } from '../auth/AuthContext';
import { offlineAuth } from '../auth/runtime';
import { authText } from '../auth/messages';
import { pickAuthorization, shareRequest } from '../auth/files';
import { fingerprint, type Authorization, type Identity } from '../auth/protocol';
import { normalizeCollectorCode } from '../utils/collectorCode';
import { TARGET_LANGUAGES, TARGET_LANGUAGE_LABELS } from '../utils/targetLanguages';

export function LoginScreen() {
  const { state, t, theme } = useApp();
  const auth = useAuth();
  const a = (key: string) => authText(state.preferences.language, key);
  const pending = auth.requests.filter((r) => !auth.authorizations.some((v) => v.payload.requestId === r.payload.requestId));
  const accounts = auth.authorizations.filter((v, i, all) => !all.slice(i + 1).some((next) => next.payload.identity.collectorCode === v.payload.identity.collectorCode));
  const [mode, setMode] = useState<'unlock' | 'request' | 'pending'>(accounts.length ? 'unlock' : pending.length ? 'pending' : 'request');
  const [selected, setSelected] = useState(auth.selectedId ?? accounts[0]?.payload.authorizationId ?? '');
  const [identity, setIdentity] = useState<Identity>({
    collectorCode: state.profile?.collectorCode ?? '', username: state.profile?.username ?? '',
    firstName: state.profile?.firstName ?? '', lastName: state.profile?.lastName ?? '', language: state.profile?.targetLanguage ?? 'ln',
  });
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = Platform.OS === 'web';
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    Keyboard.dismiss(); setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(a(e instanceof Error ? e.message : 'generic')); }
    finally { auth.refresh(); setBusy(false); setPin(''); setConfirmPin(''); }
  };
  const importFile = () => run(async () => {
    if (!offlineAuth.trust.keys.length) throw new Error('ISSUER_NOT_CONFIGURED');
    const document = await pickAuthorization();
    if (document) setAuthorization(offlineAuth.previewAuthorization(document));
  });
  const body = (value: string) => <Text style={[styles.body, { color: theme.muted }]}>{value}</Text>;
  const button = (label: string, onPress: () => void, outline = false) => <PrimaryButton compact label={label} onPress={onPress} disabled={disabled || busy} loading={busy && !outline} variant={outline ? 'outline' : 'gradient'} />;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
      <Screen>
        <View style={styles.logo}><AppLogo /></View>
        <Text style={[styles.title, { color: theme.text }]}>{a('title')}</Text>
        {body(a('intro'))}
        {Platform.OS === 'web' ? body(a('web')) : !offlineAuth.trust.keys.length ? body(a('unconfigured')) : null}
        {auth.error ? <Card><Text style={{ color: theme.text }}>{a(auth.error)}</Text><PrimaryButton label={a('retry')} onPress={auth.retry} /></Card> : (
          <View style={styles.form}>
            {authorization ? <>
              <Card>
                <Text style={[styles.subtitle, { color: theme.success }]}>{a('approved')}</Text>
                {body(`${authorization.payload.identity.firstName} ${authorization.payload.identity.lastName} · ${authorization.payload.identity.collectorCode}`)}
                {body(`${TARGET_LANGUAGE_LABELS[authorization.payload.identity.language]} · ${a('campaign')} : ${authorization.payload.campaignId}`)}
              </Card>
              {body(a('pinBody'))}
              <TextField icon="lock-closed-outline" accessibilityLabel={a('pin')} placeholder={a('pin')} secureTextEntry keyboardType="number-pad" maxLength={12} value={pin} onChangeText={setPin} />
              <TextField icon="lock-closed-outline" accessibilityLabel={a('confirmPin')} placeholder={a('confirmPin')} secureTextEntry keyboardType="number-pad" maxLength={12} value={confirmPin} onChangeText={setConfirmPin} />
              {button(a('activate'), () => void run(async () => {
                if (pin !== confirmPin) throw new Error('PIN_MISMATCH');
                await offlineAuth.activate(authorization, pin);
                setAuthorization(null);
              }))}
              {button(a('back'), () => setAuthorization(null), true)}
            </> : mode === 'unlock' ? <>
              {accounts.map((account) => <Pressable key={account.payload.authorizationId} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: selected === account.payload.authorizationId }} onPress={() => setSelected(account.payload.authorizationId)} style={[styles.option, { borderColor: selected === account.payload.authorizationId ? theme.success : theme.border, backgroundColor: theme.surface }]}>
                <Text style={[styles.subtitle, { color: theme.text }]}>{account.payload.identity.firstName} {account.payload.identity.lastName}</Text>
                {body(`${account.payload.identity.collectorCode} · ${TARGET_LANGUAGE_LABELS[account.payload.identity.language]}`)}
              </Pressable>)}
              <TextField icon="lock-closed-outline" accessibilityLabel={a('pin')} placeholder={a('pin')} secureTextEntry keyboardType="number-pad" maxLength={12} value={pin} onChangeText={setPin} onSubmitEditing={() => void run(async () => { await offlineAuth.unlock(selected, pin); })} />
              {button(a('unlock'), () => void run(async () => { await offlineAuth.unlock(selected, pin); }))}
              {button(a('recovery'), () => { setMode('request'); setPin(''); setError(null); }, true)}
              {pending.length ? button(a('pending'), () => setMode('pending'), true) : null}
            </> : mode === 'request' ? <>
              {body(a('requestBody'))}
              {accounts.length ? body(a('recoveryBody')) : null}
              {(['collectorCode', 'username', 'firstName', 'lastName'] as const).map((field) => <TextField key={field} autoCapitalize={field === 'collectorCode' ? 'characters' : field === 'username' ? 'none' : 'words'} autoCorrect={false} icon={field === 'collectorCode' ? 'key-outline' : 'person-outline'} accessibilityLabel={t(field)} placeholder={t(field)} value={identity[field]} maxLength={field === 'collectorCode' ? 24 : 60} onChangeText={(value) => setIdentity({ ...identity, [field]: value })} />)}
              <Text style={[styles.subtitle, { color: theme.text }]}>{t('targetLanguage')}</Text>
              <View style={styles.languages}>{TARGET_LANGUAGES.map((language) => <Pressable key={language} accessibilityRole="radio" accessibilityState={{ checked: identity.language === language }} onPress={() => setIdentity({ ...identity, language })} style={[styles.language, { backgroundColor: identity.language === language ? theme.successSoft : theme.surface, borderColor: theme.border }]}><Text style={{ color: theme.text }}>{TARGET_LANGUAGE_LABELS[language]}</Text></Pressable>)}</View>
              {button(a('create'), () => void run(async () => {
                await offlineAuth.createRequest({ ...identity, collectorCode: normalizeCollectorCode(identity.collectorCode), firstName: identity.firstName.trim(), lastName: identity.lastName.trim(), username: identity.username.trim() });
                setMode('pending');
              }))}
              {accounts.length ? button(a('back'), () => setMode('unlock'), true) : null}
              {pending.length ? button(a('pending'), () => setMode('pending'), true) : null}
            </> : <>
              {body(a('pendingBody'))}
              {pending.map((request) => <Card key={request.payload.requestId}>
                <Text style={[styles.subtitle, { color: theme.text }]}>{request.payload.identity.firstName} {request.payload.identity.lastName}</Text>
                {body(`${request.payload.identity.collectorCode} · ${TARGET_LANGUAGE_LABELS[request.payload.identity.language]}`)}
                {body(`${a('device')} : ${fingerprint(request.payload.devicePublicKey)}`)}
                {button(a('share'), () => void run(async () => { await shareRequest(request); }), true)}
              </Card>)}
              {button(a('import'), () => void importFile())}
              {button(a('back'), () => setMode(accounts.length ? 'unlock' : 'request'), true)}
            </>}
            {error ? <Text accessibilityRole="alert" style={{ color: theme.warning }}>{error}</Text> : null}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  logo: { alignItems: 'center', marginVertical: 12 }, title: { fontSize: 28, fontWeight: '900', marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, marginVertical: 6 }, form: { gap: 14, marginTop: 20, marginBottom: 24 },
  subtitle: { fontSize: 17, fontWeight: '700' }, option: { padding: 16, borderWidth: 2, borderRadius: 16 },
  languages: { flexDirection: 'row', gap: 8 }, language: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
});
