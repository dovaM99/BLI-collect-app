import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppLogo } from '../components/AppLogo';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';
import { describeCollectorCode, isCollectorCodeAcceptable } from '../utils/collectorCode';
import { TARGET_LANGUAGES, TARGET_LANGUAGE_LABELS, TARGET_LANGUAGE_NATIVE } from '../utils/targetLanguages';
import type { TargetLanguage } from '../types';

export function LoginScreen() {
  const { login, t, theme } = useApp();
  const [collectorCode, setCollectorCode] = useState('');
  const [username, setUsername] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const codeStatus = describeCollectorCode(collectorCode);
  const codeError = () => {
    if (!submitted) return undefined;
    if (!collectorCode.trim()) return t('required');
    if (!isCollectorCodeAcceptable(collectorCode)) return t('collectorCodeInvalid');
    return undefined;
  };
  const error = (value: string) => submitted && !value.trim() ? t('required') : undefined;

  const submit = () => {
    setSubmitted(true);
    if (!username.trim() || !lastName.trim() || !firstName.trim()) return;
    if (!isCollectorCodeAcceptable(collectorCode)) return;
    if (!targetLanguage) return;
    login({ collectorCode, username, lastName, firstName, targetLanguage });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.flex, { backgroundColor: theme.background }]}
    >
      <Screen>
        <View style={styles.logo}><AppLogo /></View>
        <Text style={[styles.title, { color: theme.text }]}>{t('login')}</Text>
        <Text style={[styles.body, { color: theme.muted }]}>{t('loginBody')}</Text>

        <View style={styles.form}>
          <TextField
            autoCapitalize="characters"
            autoCorrect={false}
            error={codeError()}
            icon="key-outline"
            onChangeText={setCollectorCode}
            placeholder={t('collectorCode')}
            returnKeyType="next"
            value={collectorCode}
          />
          {collectorCode.trim() && codeStatus.format === 'bli' && codeStatus.checksumOk ? (
            <View style={styles.codeConfirmed}>
              <Ionicons color={theme.success} name="shield-checkmark-outline" size={16} />
              <Text style={[styles.codeConfirmedText, { color: theme.success }]}>{t('collectorCodeVerified')}</Text>
            </View>
          ) : (
            <Text style={[styles.hint, { color: theme.muted }]}>{t('collectorCodeHelp')}</Text>
          )}

          <TextField
            autoCapitalize="none"
            autoCorrect={false}
            error={error(username)}
            icon="person-outline"
            onChangeText={setUsername}
            placeholder={t('username')}
            returnKeyType="next"
            value={username}
          />
          <TextField
            error={error(lastName)}
            icon="id-card-outline"
            onChangeText={setLastName}
            placeholder={t('lastName')}
            returnKeyType="next"
            value={lastName}
          />
          <TextField
            error={error(firstName)}
            icon="happy-outline"
            onChangeText={setFirstName}
            onSubmitEditing={submit}
            placeholder={t('firstName')}
            returnKeyType="done"
            value={firstName}
          />
        </View>

        <View style={styles.languageBlock}>
          <Text style={[styles.languageTitle, { color: theme.text }]}>{t('targetLanguage')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('targetLanguageBody')}</Text>
          <View style={styles.languageRow}>
            {TARGET_LANGUAGES.map((language) => {
              const active = targetLanguage === language;
              return (
                <Pressable
                  key={language}
                  onPress={() => setTargetLanguage(language)}
                  style={({ pressed }) => [
                    styles.languageOption,
                    {
                      backgroundColor: active ? colors.navy : theme.input,
                      borderColor: submitted && !targetLanguage ? colors.red : active ? colors.navy : theme.border,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.languageLabel, { color: active ? colors.white : theme.text }]}>
                    {TARGET_LANGUAGE_LABELS[language]}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.languageNative, { color: active ? colors.white : theme.muted }]}
                  >
                    {TARGET_LANGUAGE_NATIVE[language]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {submitted && !targetLanguage ? (
            <Text style={styles.languageError}>{t('targetLanguageRequired')}</Text>
          ) : null}
        </View>

        <View style={[styles.localNote, { backgroundColor: theme.blueSoft }]}>
          <Ionicons color={theme.info} name="lock-closed-outline" size={20} />
          <Text style={[styles.localNoteText, { color: theme.text }]}>{t('localOnly')}</Text>
        </View>

        <PrimaryButton icon="arrow-forward" label={t('signIn')} onPress={submit} style={styles.button} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logo: { alignItems: 'center', marginTop: 6 },
  title: {
    textAlign: 'center',
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 2,
  },
  body: { textAlign: 'center', fontSize: 16, lineHeight: 23, marginTop: 8 },
  form: { gap: 14, marginTop: 30 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 2, marginLeft: 6 },
  codeConfirmed: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginLeft: 6 },
  codeConfirmedText: { fontSize: 12, fontWeight: '700' },
  languageBlock: { marginTop: 24 },
  languageTitle: { fontSize: 17, fontWeight: '900' },
  languageRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  languageOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 3,
  },
  languageLabel: { fontSize: 14, fontWeight: '900' },
  languageNative: { fontSize: 10, fontWeight: '600' },
  languageError: { color: colors.red, fontSize: 13, fontWeight: '700', marginTop: 8, marginLeft: 6 },
  pressed: { opacity: 0.7 },
  localNote: {
    minHeight: 62,
    borderRadius: 18,
    marginTop: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  localNoteText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  button: { marginTop: 22 },
});
