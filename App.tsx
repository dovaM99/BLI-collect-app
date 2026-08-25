import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AppHeader } from './src/components/AppHeader';
import { BottomNav } from './src/components/BottomNav';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { FilesScreen } from './src/screens/FilesScreen';
import { LexiconScreen } from './src/screens/LexiconScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { WorkScreen } from './src/screens/WorkScreen';
import { AppProvider, useApp } from './src/state/AppContext';
import { colors } from './src/theme';
import type { MainScreen } from './src/types';

function AppContent() {
  const { completeOnboarding, hydrated, state, theme } = useApp();
  const [screen, setScreen] = useState<MainScreen>('dashboard');

  useEffect(() => {
    if (!state.profile) setScreen('dashboard');
  }, [state.profile]);

  if (!hydrated) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={colors.orange} size="large" />
      </View>
    );
  }

  if (!state.onboardingCompleted) {
    return <WelcomeScreen onStart={completeOnboarding} />;
  }

  if (!state.profile) {
    return <LoginScreen />;
  }

  const content = (() => {
    switch (screen) {
      case 'work':
        return <WorkScreen onFiles={() => setScreen('files')} onLeave={() => setScreen('dashboard')} />;
      case 'lexicon':
        return <LexiconScreen />;
      case 'files':
        return <FilesScreen />;
      case 'settings':
        return <SettingsScreen onFiles={() => setScreen('files')} />;
      case 'dashboard':
      default:
        return <DashboardScreen onWork={() => setScreen('work')} />;
    }
  })();

  return (
    <View style={[styles.app, { backgroundColor: theme.background }]}>
      {screen !== 'work' ? (
        <AppHeader onHome={() => setScreen('dashboard')} onMenu={() => setScreen('settings')} />
      ) : null}
      <View style={styles.content}>{content}</View>
      <BottomNav active={screen} onChange={setScreen} />
    </View>
  );
}

function ThemedRoot() {
  const { theme } = useApp();
  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[styles.app, { backgroundColor: theme.surface }]}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <AppContent />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ThemedRoot />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
