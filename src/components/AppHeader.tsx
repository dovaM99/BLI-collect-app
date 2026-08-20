import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout } from '../theme';
import { useApp } from '../state/AppContext';
import { AppLogo } from './AppLogo';

type Props = {
  onMenu: () => void;
  onHome: () => void;
};

export function AppHeader({ onHome, onMenu }: Props) {
  const { state, theme } = useApp();
  const initials = `${state.profile?.firstName[0] ?? ''}${state.profile?.lastName[0] ?? ''}`.toUpperCase();

  return (
    <View style={[styles.shell, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.content}>
        <Pressable accessibilityLabel="Menu" hitSlop={12} onPress={onMenu} style={styles.menu}>
          <Ionicons color={theme.text} name="menu" size={29} />
        </Pressable>
        <Pressable
          accessibilityLabel="Accueil"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onHome}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <AppLogo compact />
        </Pressable>
        <View style={[styles.avatar, { backgroundColor: colors.navy }]}>
          <Text style={styles.initials}>{initials || 'BLI'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderBottomWidth: 1,
  },
  content: {
    width: '100%',
    maxWidth: layout.maxWidth,
    height: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
  },
  menu: {
    width: 42,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.62,
  },
});
