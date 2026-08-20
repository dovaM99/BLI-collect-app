import React from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';

import { layout } from '../theme';
import { useApp } from '../state/AppContext';

type Props = ScrollViewProps & React.PropsWithChildren;

export function Screen({ children, contentContainerStyle, ...props }: Props) {
  const { theme } = useApp();
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[styles.scroll, contentContainerStyle]}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View style={styles.content}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    padding: layout.screenPadding,
    paddingBottom: 30,
  },
});
