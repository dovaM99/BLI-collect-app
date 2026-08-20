import { Ionicons } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '../theme';
import { useApp } from '../state/AppContext';

type Props = TextInputProps & {
  icon: ComponentProps<typeof Ionicons>['name'];
  error?: string;
};

export function TextField({ icon, error, style, ...props }: Props) {
  const { theme } = useApp();
  return (
    <View>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.input, borderColor: error ? colors.red : theme.border },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: theme.faint }]}>
          <Ionicons color={error ? colors.red : theme.info} name={icon} size={24} />
        </View>
        <TextInput
          {...props}
          autoCapitalize="words"
          placeholderTextColor={theme.muted}
          selectionColor={colors.orange}
          style={[styles.input, { color: theme.text }, style]}
        />
        {error ? <Ionicons color={colors.red} name="alert-circle" size={22} /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 68,
    borderWidth: 1.5,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingRight: 16,
    gap: 12,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  error: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 8,
  },
});
