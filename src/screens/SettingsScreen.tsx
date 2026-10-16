import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { writeExportFile } from '../services/dataFiles';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';
import { Screen } from '../components/Screen';
import { formatCollectorCode } from '../utils/collectorCode';
import { TARGET_LANGUAGE_LABELS } from '../utils/targetLanguages';
import type { ThemeMode } from '../types';
import { useAuth } from '../auth/AuthContext';

type Props = {
  onFiles: () => void;
};

export function SettingsScreen({ onFiles }: Props) {
  const { abandonCollection, logout, setLanguage, setTheme, snapshot, state, t, theme } = useApp();
  const auth = useAuth();
  const packName = state.preferences.language === 'en' ? state.pack.nameEn ?? state.pack.name : state.pack.name;
  const hasCollectionProgress = state.sessions.some((session) => session.packId === state.pack.id)
    || Object.values(state.annotations).some((annotation) => annotation.packId === state.pack.id);

  const confirmLogout = () => {
    Alert.alert(t('logout'), t('logoutBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: logout },
    ]);
  };

  const confirmAbandon = () => {
    Alert.alert(t('abandonCollection'), t('abandonCollectionBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('abandon'),
        style: 'destructive',
        onPress: () => {
          void writeExportFile(snapshot())
            .then(() => { abandonCollection(); auth.lock(); Alert.alert(t('abandonConfirmed'), t('abandonConfirmedBody')); })
            .catch(() => Alert.alert(t('exports'), t('genericError')));
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.titleRow}>
        <IconTile backgroundColor={theme.blueSoft} color={colors.navy} name="settings-outline" size={28} />
        <Text style={[styles.title, { color: theme.text }]}>{t('settings')}</Text>
      </View>

      {state.profile ? (
        <Card style={styles.card}>
          <View style={styles.cardHeading}>
            <IconTile backgroundColor={theme.successSoft} color={theme.success} name="person-circle-outline" />
            <View style={styles.headingText}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t('collectorIdentity')}</Text>
              <Text style={[styles.cardBody, { color: theme.muted }]}>{t('collectorIdentityBody')}</Text>
            </View>
          </View>
          <View style={[styles.packInfo, { backgroundColor: theme.faint }]}>
            <View style={styles.packText}>
              <Text style={[styles.packName, { color: theme.text }]}>
                {state.profile.firstName} {state.profile.lastName}
              </Text>
              <Text style={[styles.packMeta, { color: theme.muted }]}>
                {t('collectorCode')} : {formatCollectorCode(state.profile.collectorCode)}
              </Text>
              <Text style={[styles.packMeta, { color: theme.muted }]}>
                {t('targetLanguage')} : {TARGET_LANGUAGE_LABELS[state.profile.targetLanguage]}
              </Text>
            </View>
            <Ionicons
              color={theme.success}
              name="person-circle"
              size={24}
            />
          </View>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <IconTile backgroundColor={theme.blueSoft} color={theme.info} name="language-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('language')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{t('languageBody')}</Text>
          </View>
        </View>
        <View style={[styles.segment, { backgroundColor: theme.faint }]}>
          <Segment label="Français" active={state.preferences.language === 'fr'} onPress={() => setLanguage('fr')} />
          <Segment label="English" active={state.preferences.language === 'en'} onPress={() => setLanguage('en')} />
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <IconTile backgroundColor={theme.orangeSoft} color={theme.warning} name="moon-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('theme')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{t('themeBody')}</Text>
          </View>
        </View>
        <View style={styles.themeRow}>
          <ThemeOption
            active={state.preferences.theme === 'light'}
            icon="sunny-outline"
            label={t('light')}
            mode="light"
            onPress={setTheme}
          />
          <ThemeOption
            active={state.preferences.theme === 'dark'}
            icon="moon-outline"
            label={t('dark')}
            mode="dark"
            onPress={setTheme}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <IconTile backgroundColor={theme.successSoft} color={theme.success} name="clipboard-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('collectionTask')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{t('collectionTaskBody')}</Text>
          </View>
        </View>
        <View style={[styles.packInfo, { backgroundColor: theme.faint }]}>
          <View style={styles.packText}>
            <Text numberOfLines={1} style={[styles.packName, { color: theme.text }]}>{packName}</Text>
            <Text style={[styles.packMeta, { color: theme.muted }]}> 
              {state.pack.items.length} {t('items')} · v{state.pack.version} · {TARGET_LANGUAGE_LABELS[state.pack.targetLanguage]}
            </Text>
          </View>
          <Ionicons color={theme.success} name="checkmark-circle" size={24} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Pressable onPress={onFiles} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <IconTile backgroundColor={theme.blueSoft} color={theme.info} name="folder-open-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('manageFiles')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{t('remotePack')}</Text>
          </View>
          <Ionicons color={theme.text} name="chevron-forward" size={23} />
        </Pressable>
      </Card>

      {hasCollectionProgress ? (
        <Card style={styles.card}>
          <Pressable onPress={confirmAbandon} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
            <IconTile backgroundColor={theme.redSoft} color={colors.red} name="flag-outline" />
            <View style={styles.headingText}>
              <Text style={[styles.cardTitle, { color: colors.red }]}>{t('abandonCollection')}</Text>
              <Text style={[styles.cardBody, { color: theme.muted }]}>{t('abandonBody')}</Text>
            </View>
            <Ionicons color={colors.red} name="chevron-forward" size={23} />
          </Pressable>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <IconTile backgroundColor={theme.redSoft} color={colors.red} name="log-out-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: colors.red }]}>{t('logout')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{state.profile ? `${state.profile.firstName} ${state.profile.lastName}` : ''}</Text>
          </View>
          <Ionicons color={colors.red} name="chevron-forward" size={23} />
        </Pressable>
      </Card>
    </Screen>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segmentButton, active && { backgroundColor: colors.navy }]}
    >
      <Text style={[styles.segmentLabel, { color: active ? colors.white : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function ThemeOption({
  active,
  icon,
  label,
  mode,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  mode: ThemeMode;
  onPress: (mode: ThemeMode) => void;
}) {
  const { theme } = useApp();
  const darkPreview = mode === 'dark';
  return (
    <Pressable onPress={() => onPress(mode)} style={styles.themeOption}>
      <View
        style={[
          styles.themePreview,
          {
            backgroundColor: darkPreview ? '#101722' : '#F7F8FB',
            borderColor: active ? colors.orange : theme.border,
          },
        ]}
      >
        <Ionicons color={darkPreview ? '#FFFFFF' : colors.navy} name={icon} size={28} />
        <View style={[styles.previewCard, { backgroundColor: darkPreview ? '#222C38' : '#FFFFFF' }]}>
          <View style={[styles.previewLine, { backgroundColor: colors.orange }]} />
          <View style={[styles.previewLine, { backgroundColor: darkPreview ? '#596677' : '#DDE3EA' }]} />
        </View>
      </View>
      <Text style={[styles.themeLabel, { color: active ? theme.warning : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  card: { marginBottom: 14 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headingText: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  cardBody: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  segment: { flexDirection: 'row', borderRadius: 15, padding: 4, marginTop: 16 },
  segmentButton: { flex: 1, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontSize: 14, fontWeight: '800' },
  themeRow: { flexDirection: 'row', gap: 14, marginTop: 17 },
  themeOption: { flex: 1, alignItems: 'center' },
  themePreview: {
    width: '100%',
    height: 105,
    borderRadius: 18,
    borderWidth: 2,
    padding: 13,
    justifyContent: 'space-between',
  },
  previewCard: { borderRadius: 9, padding: 9, gap: 7 },
  previewLine: { height: 5, borderRadius: 3 },
  themeLabel: { marginTop: 7, fontWeight: '800' },
  packInfo: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, marginTop: 15 },
  packText: { flex: 1 },
  packName: { fontSize: 14, fontWeight: '800' },
  packMeta: { fontSize: 11, marginTop: 3 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pressed: { opacity: 0.65 },
});
