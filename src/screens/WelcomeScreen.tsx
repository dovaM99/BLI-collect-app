import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppLogo } from '../components/AppLogo';
import { IconTile } from '../components/IconTile';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';

type Props = {
  onStart: () => void;
};

const features = [
  { icon: 'create-outline' as const, title: 'annotate', body: 'annotateBody', color: colors.navyBright, bg: '#EAF2FA' },
  { icon: 'cloud-offline-outline' as const, title: 'offline', body: 'offlineBody', color: colors.orangeDeep, bg: '#FFF3DF' },
  { icon: 'people-outline' as const, title: 'contribute', body: 'contributeBody', color: colors.green, bg: '#ECF7E9' },
];

export function WelcomeScreen({ onStart }: Props) {
  const { t, theme } = useApp();

  return (
    <Screen contentContainerStyle={styles.scroll}>
      <View style={styles.logo}><AppLogo /></View>
      <Text style={[styles.title, { color: theme.text }]}>{t('welcomeTitle')}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{t('welcomeBody')}</Text>

      <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.heroGlow, { backgroundColor: theme.orangeSoft }]} />
        <View style={[styles.sheet, { backgroundColor: theme.surfaceRaised, borderColor: theme.border }]}>
          <View style={[styles.sheetLine, styles.sheetLineShort, { backgroundColor: colors.orange }]} />
          <View style={[styles.sheetLine, { backgroundColor: theme.border }]} />
          <View style={[styles.sheetLine, { backgroundColor: theme.border }]} />
          <View style={[styles.sheetLine, styles.sheetLineMid, { backgroundColor: theme.border }]} />
        </View>
        <View style={styles.pencil}>
          <Ionicons color={colors.navy} name="pencil" size={86} />
        </View>
        <View style={[styles.chat, { backgroundColor: theme.orangeSoft }]}>
          <View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} />
        </View>
        <Ionicons color={colors.green} name="leaf" size={66} style={styles.leaf} />
      </View>

      <View style={styles.features}>
        {features.map((feature) => (
          <View key={feature.title} style={styles.feature}>
            <IconTile backgroundColor={feature.bg} color={feature.color} name={feature.icon} size={23} />
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: theme.text }]}>{t(feature.title)}</Text>
              <Text style={[styles.featureBody, { color: theme.muted }]}>{t(feature.body)}</Text>
            </View>
          </View>
        ))}
      </View>

      <PrimaryButton icon="arrow-forward" label={t('start')} onPress={onStart} style={styles.button} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 8,
  },
  logo: {
    alignItems: 'center',
    marginBottom: -4,
  },
  title: {
    textAlign: 'center',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  body: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 25,
    paddingHorizontal: 14,
  },
  hero: {
    height: 230,
    marginTop: 26,
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.7,
  },
  sheet: {
    width: 176,
    height: 140,
    borderRadius: 20,
    borderWidth: 1,
    padding: 34,
    gap: 13,
  },
  sheetLine: {
    height: 8,
    borderRadius: 4,
    width: '100%',
  },
  sheetLineShort: {
    width: '54%',
  },
  sheetLineMid: {
    width: '76%',
  },
  pencil: {
    position: 'absolute',
    right: 40,
    bottom: 42,
    transform: [{ rotate: '-13deg' }],
  },
  chat: {
    position: 'absolute',
    top: 30,
    left: 38,
    width: 84,
    height: 54,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
  leaf: {
    position: 'absolute',
    left: 32,
    bottom: 22,
    transform: [{ rotate: '-28deg' }],
  },
  features: {
    marginTop: 22,
    gap: 11,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  featureBody: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    marginTop: 25,
  },
});
