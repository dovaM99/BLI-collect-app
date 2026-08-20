import { Ionicons } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout } from '../theme';
import type { MainScreen } from '../types';
import { useApp } from '../state/AppContext';

type Item = {
  key: MainScreen;
  icon: ComponentProps<typeof Ionicons>['name'];
  activeIcon: ComponentProps<typeof Ionicons>['name'];
  labelKey: string;
};

const items: Item[] = [
  { key: 'dashboard', icon: 'home-outline', activeIcon: 'home', labelKey: 'dashboard' },
  { key: 'work', icon: 'clipboard-outline', activeIcon: 'clipboard', labelKey: 'tasks' },
  { key: 'files', icon: 'folder-outline', activeIcon: 'folder', labelKey: 'files' },
  { key: 'settings', icon: 'settings-outline', activeIcon: 'settings', labelKey: 'settings' },
];

type Props = {
  active: MainScreen;
  onChange: (screen: MainScreen) => void;
};

export function BottomNav({ active, onChange }: Props) {
  const { t, theme } = useApp();
  return (
    <View style={[styles.shell, { backgroundColor: theme.nav, borderTopColor: theme.border }]}>
      <View style={styles.content}>
        {items.map((item) => {
          const selected = active === item.key;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.key}
              onPress={() => onChange(item.key)}
              style={({ pressed }) => [
                styles.item,
                selected && styles.active,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                color={selected ? colors.white : theme.muted}
                name={selected ? item.activeIcon : item.icon}
                size={24}
              />
              <Text numberOfLines={1} style={[styles.label, { color: selected ? colors.white : theme.muted }]}>
                {t(item.labelKey)}
              </Text>
              {selected ? <View style={styles.indicator} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 7,
  },
  content: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  item: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  active: {
    backgroundColor: colors.navy,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  indicator: {
    position: 'absolute',
    bottom: -7,
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.orange,
  },
  pressed: {
    opacity: 0.76,
  },
});
