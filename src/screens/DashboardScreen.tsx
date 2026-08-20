import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressRing } from '../components/ProgressRing';
import { Screen } from '../components/Screen';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';
import { formatCollectionDate, getCollectionSchedule } from '../utils/collectionSchedule';

type Props = {
  onWork: () => void;
};

export function DashboardScreen({ onWork }: Props) {
  const { state, t, theme } = useApp();
  const [showCalendarInfo, setShowCalendarInfo] = useState(false);
  const packAnnotations = Object.values(state.annotations).filter((annotation) => annotation.packId === state.pack.id);
  const validated = packAnnotations.filter((annotation) => annotation.status === 'validated').length;
  const total = state.pack.items.length;
  const percent = total ? (validated / total) * 100 : 0;
  const workDays = new Set(packAnnotations.map((annotation) => annotation.updatedAt.slice(0, 10))).size;
  const remaining = Math.max(0, total - validated);
  const packName = state.preferences.language === 'en' ? state.pack.nameEn ?? state.pack.name : state.pack.name;
  const schedule = getCollectionSchedule(state.profile!);
  const dailyPace = remaining > 0
    ? Math.ceil(remaining / Math.max(1, schedule.daysRemaining))
    : 0;
  const startDate = formatCollectionDate(schedule.start, state.preferences.language);
  const endDate = formatCollectionDate(schedule.end, state.preferences.language);

  const calendarMessage = t('collectionCalendarBody', {
    months: schedule.durationMonths,
    start: startDate,
    end: endDate,
    days: schedule.daysRemaining,
  });

  return (
    <Screen>
      <View style={styles.greetingRow}>
        <View style={styles.greetingText}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.greeting, { color: theme.text }]}>
            {t('hello')} {state.profile?.firstName} 👋
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t('dashboardBody')}</Text>
        </View>
        <View style={[styles.offlinePill, { backgroundColor: theme.successSoft }]}>
          <View style={styles.onlineDot} />
          <Text style={styles.offlineText}>{t('offlineFirst')}</Text>
        </View>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.cardTitleRow}>
          <IconTile backgroundColor={colors.navy} color={colors.white} name="trending-up" />
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('globalProgress')}</Text>
          <Pressable
            accessibilityLabel={t('collectionCalendarTitle')}
            accessibilityState={{ expanded: showCalendarInfo }}
            hitSlop={12}
            onPress={() => setShowCalendarInfo((visible) => !visible)}
            style={({ pressed }) => [styles.infoButton, { backgroundColor: theme.faint }, pressed && styles.pressed]}
          >
            <Ionicons color={theme.muted} name={showCalendarInfo ? 'close' : 'information-circle-outline'} size={23} />
          </Pressable>
        </View>
        {showCalendarInfo ? (
          <View style={[styles.infoMessage, { backgroundColor: theme.blueSoft }]}>
            <Ionicons color={theme.info} name="time-outline" size={20} />
            <Text style={[styles.infoMessageText, { color: theme.text }]}>{calendarMessage}</Text>
          </View>
        ) : null}
        <View style={styles.progressContent}>
          <ProgressRing percent={percent} size={150} />
          <View style={styles.stats}>
            <Stat
              color={theme.success}
              icon="create-outline"
              label={t('annotations')}
              value={`${validated} / ${total}`}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Stat
              color={theme.warning}
              icon="calendar-outline"
              label={t('workDays')}
              value={String(workDays)}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Stat
              color={theme.info}
              icon="speedometer-outline"
              label={t('pace')}
              value={`${dailyPace} ${t('perDay')}`}
            />
          </View>
        </View>
      </Card>

      <Card style={[styles.goalCard, { backgroundColor: colors.navy, borderColor: colors.navy }]}>
        <View style={styles.goalTitleRow}>
          <View style={styles.goalIcon}><Ionicons color={colors.navy} name="flag" size={22} /></View>
          <Text style={styles.goalTitle}>{t('packGoal')}</Text>
          <Text style={styles.goalValue}>{validated}<Text style={styles.goalTotal}> / {total}</Text></Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.remaining}>{remaining} {t('remaining')} · {packName}</Text>
        <View style={styles.goalDeadline}>
          <Ionicons color={colors.orange} name="calendar-outline" size={21} />
          <View style={styles.deadlineText}>
            <Text style={styles.deadlineTitle}>{t('collectionDeadline', { date: endDate })}</Text>
            <Text style={styles.deadlineCaption}>
              {schedule.expired ? t('deadlineReached') : t('daysRemaining', { days: schedule.daysRemaining })}
              {' · '}{t('collectionPeriod', { start: startDate, end: endDate })}
            </Text>
          </View>
        </View>
      </Card>

      <View style={[styles.savedNote, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <IconTile backgroundColor={theme.blueSoft} color={theme.info} name="cloud-done-outline" />
        <View style={styles.savedText}>
          <Text style={[styles.savedTitle, { color: theme.text }]}>{t('savedLocally')}</Text>
          <Text style={[styles.savedBody, { color: theme.muted }]}>{t('savedDetail')}</Text>
        </View>
      </View>

      <PrimaryButton
        disabled={state.pack.items.length === 0}
        icon="arrow-forward"
        label={state.pack.items.length === 0 ? t('waitingForFirstBlock') : validated ? t('continueWork') : t('startWork')}
        onPress={onWork}
        style={styles.cta}
      />
    </Screen>
  );
}

type StatProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  value: string;
};

function Stat({ icon, color, label, value }: StatProps) {
  const { theme } = useApp();
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons color={color} name={icon} size={20} />
      </View>
      <View style={styles.statText}>
        <Text style={[styles.statLabel, { color: theme.muted }]}>{label}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 22,
  },
  greetingText: { flex: 1 },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
  },
  offlinePill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  offlineText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '800',
  },
  progressCard: { padding: 18 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
  },
  infoButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.62,
  },
  infoMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 14,
    padding: 12,
    marginTop: 13,
  },
  infoMessageText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  progressContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 20,
  },
  stats: {
    flex: 1,
    gap: 10,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: { flex: 1 },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  statValue: {
    marginTop: 1,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  divider: {
    height: 1,
    marginLeft: 48,
  },
  goalCard: {
    marginTop: 16,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goalIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  goalValue: {
    color: colors.orange,
    fontSize: 27,
    fontWeight: '900',
  },
  goalTotal: {
    color: colors.white,
    fontSize: 19,
  },
  progressTrack: {
    height: 12,
    backgroundColor: '#DCE2EA',
    borderRadius: 7,
    overflow: 'hidden',
    marginTop: 18,
  },
  progressFill: {
    height: '100%',
    maxWidth: '100%',
    borderRadius: 7,
    backgroundColor: colors.orange,
  },
  remaining: {
    color: '#D7E2EE',
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
  },
  goalDeadline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#315579',
  },
  deadlineText: {
    flex: 1,
  },
  deadlineTitle: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  deadlineCaption: {
    color: '#BFD0E1',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  savedNote: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  savedText: { flex: 1 },
  savedTitle: { fontSize: 15, fontWeight: '800' },
  savedBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  cta: { marginTop: 18 },
});
