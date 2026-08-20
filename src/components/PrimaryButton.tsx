import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import { colors } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
  variant?: 'gradient' | 'outline';
  compact?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  style,
  variant = 'gradient',
  compact = false,
}: Props) {
  if (variant === 'outline') {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled || loading}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          compact && styles.compactButton,
          styles.outline,
          style,
          (disabled || loading) && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {loading ? <ActivityIndicator color={colors.navy} /> : <Ionicons color={colors.navy} name={icon ?? 'arrow-forward'} size={21} />}
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.1}
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[styles.outlineLabel, compact && styles.compactOutlineLabel]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [style, (disabled || loading) && styles.disabled, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[colors.orange, '#FFAD13', colors.orange]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={[styles.button, compact && styles.compactButton]}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : null}
        <Text
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.1}
          minimumFontScale={0.7}
          numberOfLines={1}
          style={[styles.label, compact && styles.compactLabel]}
        >
          {label}
        </Text>
        {!loading && icon ? <Ionicons color={colors.white} name={icon} size={24} /> : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 58,
    borderRadius: 20,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.navy,
    backgroundColor: colors.white,
  },
  outlineLabel: {
    flexShrink: 1,
    color: colors.navy,
    fontSize: 16,
    fontWeight: '800',
  },
  compactButton: {
    minHeight: 52,
    borderRadius: 17,
    paddingHorizontal: 16,
    gap: 8,
  },
  compactLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  compactOutlineLabel: {
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.992 }],
  },
});
