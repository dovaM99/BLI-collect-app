import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { AppLogo } from '../components/AppLogo';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';

export function LoginScreen() {
  const { login, t, theme } = useApp();
  const [username, setUsername] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const error = (value: string) => submitted && !value.trim() ? t('required') : undefined;

  const submit = () => {
    setSubmitted(true);
    if (!username.trim() || !lastName.trim() || !firstName.trim()) return;
    login({ username, lastName, firstName });
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
  logo: {
    alignItems: 'center',
    marginTop: 6,
  },
  title: {
    textAlign: 'center',
    fontSize: 39,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 2,
  },
  body: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  form: {
    gap: 14,
    marginTop: 30,
  },
  localNote: {
    minHeight: 62,
    borderRadius: 18,
    marginTop: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  localNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  button: {
    marginTop: 22,
  },
});
