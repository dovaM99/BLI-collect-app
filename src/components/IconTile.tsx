import { Ionicons } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  name: ComponentProps<typeof Ionicons>['name'];
  color: string;
  backgroundColor: string;
  size?: number;
};

export function IconTile({ name, color, backgroundColor, size = 24 }: Props) {
  return (
    <View style={[styles.tile, { backgroundColor }]}>
      <Ionicons color={color} name={name} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
