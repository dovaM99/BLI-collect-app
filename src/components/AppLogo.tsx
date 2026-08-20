import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useApp } from '../state/AppContext';

type Props = {
  compact?: boolean;
};

export function AppLogo({ compact = false }: Props) {
  const { theme } = useApp();
  return (
    <View
      style={[
        styles.frame,
        compact && styles.compactFrame,
        theme.dark && styles.darkFrame,
      ]}
    >
      <Image
        accessibilityLabel="Bantu Languages Initiative"
        resizeMode="contain"
        source={require('../../logo/logo-bli-futurist.png')}
        style={[styles.image, compact && styles.compactImage]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 240,
    height: 130,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 300,
    height: 200,
    transform: [{ translateY: 8 }],
  },
  compactFrame: {
    width: 130,
    height: 66,
  },
  compactImage: {
    width: 160,
    height: 107,
    transform: [{ translateY: 6 }],
  },
  darkFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
  },
});
