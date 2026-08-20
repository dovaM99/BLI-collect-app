import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { layout } from '../theme';
import { useApp } from '../state/AppContext';

export function Card({ style, ...props }: ViewProps) {
  const { theme } = useApp();
  return (
    <View
      {...props}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: layout.radiusLarge,
    borderWidth: 1,
    padding: 20,
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});
