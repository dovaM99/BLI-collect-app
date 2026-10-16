import React, { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useApp } from '../state/AppContext';
import { useAuth } from '../auth/AuthContext';
import { localAuth } from '../auth/runtime';
import { authText } from '../auth/messages';
import type { CollectorLanguage } from '../auth/engine';
import { TARGET_LANGUAGES, TARGET_LANGUAGE_LABELS } from '../utils/targetLanguages';

type Mode = 'unlock' | 'register' | 'forgot';

export function LoginScreen() {
  const { state, t, theme } = useApp();
  const auth = useAuth();
  const a = (key: string) => authText(state.preferences.language, key);
  const [mode, setMode] = useState<Mode>(auth.accounts.length ? 'unlock' : 'register');
  const [selected, setSelected] = useState(auth.selectedCode ?? auth.accounts[auth.accounts.length - 1]?.collectorCode ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [language, setLanguage] = useState<CollectorLanguage>(state.profile?.targetLanguage ?? 'ln');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = auth.accounts.find((entry) => entry.collectorCode === selected);

  const go = (next: Mode) => {
    setMode(next); setError(null); setPin(''); setConfirmPin('');
    // Jamais pré-rempli : pour « code oublié », c'est la saisie du nom qui fait office de vérification.
    if (next !== 'unlock') { setFirstName(''); setLastName(''); }
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    Keyboard.dismiss(); setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(a(e instanceof Error ? e.message : 'generic')); }
    finally { auth.refresh(); setBusy(false); setPin(''); setConfirmPin(''); }
  };
  const checkConfirm = () => { if (pin !== confirmPin) throw new Error('PIN_MISMATCH'); };

  const body = (value: string) => <Text style={[styles.body, { color: theme.muted }]}>{value}</Text>;
  const button = (label: string, onPress: () => void, outline = false) => (
    <PrimaryButton compact label={label} onPress={onPress} disabled={busy} loading={busy && !outline} variant={outline ? 'outline' : 'gradient'} />
  );
  const pinField = (label: string, value: string, onChange: (v: string) => void, onSubmit?: () => void) => (
    <TextField icon="lock-closed-outline" accessibilityLabel={label} placeholder={label} secureTextEntry keyboardType="number-pad"
      maxLength={12} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, ''))} onSubmitEditing={onSubmit} />
  );
  const nameFields = (
    <>
      <TextField icon="person-outline" autoCapitalize="words" autoCorrect={false} accessibilityLabel={t('firstName')} placeholder={t('firstName')} maxLength={80} value={firstName} onChangeText={setFirstName} />
      <TextField icon="person-outline" autoCapitalize="words" autoCorrect={false} accessibilityLabel={t('lastName')} placeholder={t('lastName')} maxLength={80} value={lastName} onChangeText={setLastName} />
    </>
  );
  const unlock = () => void run(() => localAuth.unlock(selected, pin));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
      <Screen>
        <View style={styles.logo}><AppLogo /></View>
        <Text style={[styles.title, { color: theme.text }]}>{a('title')}</Text>
        {auth.error ? (
          <Card><Text style={{ color: theme.text }}>{a(auth.error)}</Text><PrimaryButton label={a('retry')} onPress={auth.retry} /></Card>
        ) : (
          <View style={styles.form}>
            {mode === 'unlock' ? <>
              <Text style={[styles.subtitle, { color: theme.text }]}>{a('unlockTitle')}</Text>
              {auth.accounts.length > 1 ? auth.accounts.map((entry) => (
                <Pressable key={entry.collectorCode} disabled={busy} accessibilityRole="radio" accessibilityState={{ checked: selected === entry.collectorCode }}
                  onPress={() => { setSelected(entry.collectorCode); setError(null); }}
                  style={[styles.option, { borderColor: selected === entry.collectorCode ? theme.success : theme.border, backgroundColor: theme.surface }]}>
                  <Text style={[styles.subtitle, { color: theme.text }]}>{entry.firstName} {entry.lastName}</Text>
                  {body(TARGET_LANGUAGE_LABELS[entry.language])}
                </Pressable>
              )) : account ? (
                <Card><Text style={[styles.subtitle, { color: theme.text }]}>{account.firstName} {account.lastName}</Text>{body(TARGET_LANGUAGE_LABELS[account.language])}</Card>
              ) : null}
              {account && !account.pinSet ? <>
                {body(a('migratedBody'))}
                {button(a('choosePin'), () => go('forgot'))}
              </> : <>
                {pinField(a('pin'), pin, setPin, unlock)}
                {button(a('unlock'), unlock)}
                {button(a('forgot'), () => go('forgot'), true)}
              </>}
              {button(a('newCollector'), () => go('register'), true)}
            </> : mode === 'register' ? <>
              <Text style={[styles.subtitle, { color: theme.text }]}>{a('registerTitle')}</Text>
              {body(a('intro'))}
              {nameFields}
              <Text style={[styles.subtitle, { color: theme.text }]}>{t('targetLanguage')}</Text>
              <View style={styles.languages}>{TARGET_LANGUAGES.map((entry) => (
                <Pressable key={entry} accessibilityRole="radio" accessibilityState={{ checked: language === entry }} onPress={() => setLanguage(entry)}
                  style={[styles.language, { backgroundColor: language === entry ? theme.successSoft : theme.surface, borderColor: language === entry ? theme.success : theme.border }]}>
                  <Text style={{ color: theme.text }}>{TARGET_LANGUAGE_LABELS[entry]}</Text>
                </Pressable>
              ))}</View>
              {body(a('pinBody'))}
              {pinField(a('pin'), pin, setPin)}
              {pinField(a('confirmPin'), confirmPin, setConfirmPin)}
              {button(a('register'), () => void run(async () => { checkConfirm(); await localAuth.register({ firstName, lastName, language }, pin); }))}
              {auth.accounts.length ? button(a('back'), () => go('unlock'), true) : null}
            </> : <>
              <Text style={[styles.subtitle, { color: theme.text }]}>{account && !account.pinSet ? a('choosePin') : a('forgotTitle')}</Text>
              {body(account && !account.pinSet ? a('migratedBody') : a('forgotBody'))}
              {nameFields}
              {pinField(a('newPin'), pin, setPin)}
              {pinField(a('confirmPin'), confirmPin, setConfirmPin)}
              {button(a('resetPin'), () => void run(async () => { checkConfirm(); await localAuth.resetPin(firstName, lastName, pin); }))}
              {button(a('back'), () => go(auth.accounts.length ? 'unlock' : 'register'), true)}
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
