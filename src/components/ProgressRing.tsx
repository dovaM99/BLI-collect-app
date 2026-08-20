import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme';
import { useApp } from '../state/AppContext';

type Props = {
  percent: number;
  size?: number;
};

export function ProgressRing({ percent, size = 172 }: Props) {
  const { theme, t } = useApp();
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, percent));

  return (
    <View style={{ width: size, height: size }}>
      <Svg height={size} style={styles.svg} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={theme.faint}
          strokeWidth={stroke}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={colors.orange}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (progress / 100) * circumference}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.labelWrap}>
        <Text style={[styles.percent, { color: theme.text }]}>{Math.round(progress)}%</Text>
        <Text style={[styles.caption, { color: theme.muted }]}>{t('completed')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: {
    position: 'absolute',
  },
  labelWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  caption: {
    fontSize: 13,
    fontWeight: '700',
  },
});
