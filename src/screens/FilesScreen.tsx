import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { installAssignmentFromUrl, importAssignmentDocument } from '../services/assignmentFiles';
import { countExportAnnotations, writeAndShareExport } from '../services/dataFiles';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';

export function FilesScreen() {
  const {
    applyAssignmentPack,
    snapshot,
    state,
    t,
    theme,
    updateAssignment,
    useSamplePack,
  } = useApp();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<'download' | 'import' | 'export' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setMessage(null);
    setError(null);
  };

  const installCallbacks = () => ({
    onProgress: updateAssignment,
    onPackReady: (pack: Parameters<typeof applyAssignmentPack>[0], progress: Parameters<typeof applyAssignmentPack>[1]) => {
      applyAssignmentPack(pack, progress);
      setMessage(progress.status === 'ready' ? t('assignmentReady') : t('assignmentPartialReady', { count: pack.items.length }));
    },
  });

  const errorMessage = (caught: unknown) => {
    const code = caught instanceof Error ? caught.message : '';
    if (['INVALID_ASSIGNMENT', 'INVALID_PACK_MANIFEST', 'ASSIGNMENT_ITEM_COUNT_MISMATCH', 'ASSIGNMENT_ITEM_NOT_FOUND', 'DUPLICATE_ITEM_ID'].includes(code)) {
      return t('invalidAssignment');
    }
    if (['INVALID_ARCHIVE', 'UNSUPPORTED_ARCHIVE', 'MISSING_IMAGE', 'ARCHIVE_TOO_LARGE'].includes(code)) {
      return t('invalidArchive');
    }
    if (code === 'CHECKSUM_MISMATCH') return t('checksumMismatch');
    if (code === 'NOT_ENOUGH_SPACE') return t('notEnoughSpace');
    if (code === 'MOBILE_STORAGE_REQUIRED') return t('mobileStorageRequired');
    if (code === 'DRIVE_DOWNLOAD_REJECTED' || code.startsWith('HTTP_')) return t('driveDownloadError');
    return t('genericError');
  };

  const download = async () => {
    begin();
    const sourceUrl = url.trim() || state.assignment?.sourceUrl || '';
    if (!/^https:\/\//i.test(sourceUrl)) {
      setError(t('invalidUrl'));
      return;
    }
    setBusy('download');
    try {
      await installAssignmentFromUrl(sourceUrl, installCallbacks());
      setMessage(t('assignmentReady'));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const importDocument = async () => {
    begin();
    setBusy('import');
    try {
      const imported = await importAssignmentDocument(installCallbacks());
      if (imported) setMessage(t('assignmentReady'));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const exportAnnotations = async () => {
    begin();
    setBusy('export');
    try {
      const result = await writeAndShareExport(snapshot());
      if (!result.canShare) Alert.alert(t('exports'), `${t('noExport')}\n${result.fileUri}`);
      else setMessage(t('savedLocally'));
    } catch {
      setError(t('genericError'));
    } finally {
      setBusy(null);
    }
  };

  const annotationCount = countExportAnnotations(state);
  const packName = state.preferences.language === 'en' ? state.pack.nameEn ?? state.pack.name : state.pack.name;
  const assignment = state.assignment;
  const assignmentRunning = assignment?.status === 'downloading';
  const targetItems = assignment?.targetItems ?? state.pack.targetItems ?? state.pack.items.length;
  const transferPercent = assignment
    ? assignment.totalBytes > 0
      ? Math.min(100, (assignment.downloadedBytes / assignment.totalBytes) * 100)
      : (assignment.installedPackIds.length / assignment.totalPacks) * 100
    : 100;
  const processingPhase = assignment?.phase === 'verifying' || assignment?.phase === 'extracting';
  const progressPercent = assignment?.status === 'ready'
    ? 100
    : processingPhase && assignment.phaseProgress !== undefined
      ? Math.min(100, assignment.phaseProgress * 100)
      : transferPercent;
  const progressLabel = assignment?.status === 'ready'
    ? t('assignmentReady')
    : assignment?.status === 'error'
      ? t('assignmentFailed')
    : assignment?.phase === 'verifying'
      ? t('assignmentVerifying')
      : assignment?.phase === 'extracting'
        ? t('assignmentExtracting')
        : t('assignmentProgress');

  return (
    <Screen>
      <View style={styles.titleRow}>
        <IconTile backgroundColor={theme.blueSoft} color={theme.info} name="folder-open-outline" size={28} />
        <View style={styles.titleText}>
          <Text
            adjustsFontSizeToFit
            maxFontSizeMultiplier={1.1}
            minimumFontScale={0.78}
            numberOfLines={1}
            style={[styles.title, { color: theme.text }]}
          >
            {t('filesTitle')}
          </Text>
          <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.titleCaption, { color: theme.success }]}>● {t('offlineFirst')}</Text>
        </View>
      </View>

      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <IconTile backgroundColor={theme.successSoft} color={theme.success} name="cloud-done-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>{t('activePack')}</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{packName}</Text>
          </View>
          <Ionicons
            color={assignment?.status === 'error' ? colors.red : assignmentRunning ? theme.warning : theme.success}
            name={assignment?.status === 'error' ? 'alert-circle' : assignmentRunning ? 'cloud-download-outline' : 'checkmark-circle'}
            size={27}
          />
        </View>
        <View style={[styles.packStats, { backgroundColor: theme.faint }]}> 
          <Stat icon="images-outline" label={`${state.pack.items.length} / ${targetItems} ${t('items')}`} />
          <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />
          <Stat
            icon="download-outline"
            label={assignment
              ? `${assignment.installedPackIds.length} / ${assignment.totalPacks} ${t('archives')}`
              : t('availableOffline')}
          />
          <View style={[styles.verticalDivider, { backgroundColor: theme.border }]} />
          <Stat icon="git-branch-outline" label={`v${state.pack.version}`} />
        </View>
        {assignment ? (
          <View style={styles.assignmentProgress}>
            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}> 
              <View style={[styles.progressFill, { width: `${Math.max(2, progressPercent)}%` }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={[styles.progressText, { color: theme.text }]}> 
                {progressLabel}
              </Text>
              <Text style={[styles.progressPercent, { color: theme.muted }]}>{Math.round(progressPercent)}%</Text>
            </View>
          </View>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <IconTile backgroundColor={theme.orangeSoft} color={theme.warning} name="download-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('remoteAssignment')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{t('remoteAssignmentBody')}</Text>
          </View>
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setUrl}
          placeholder={t('urlPlaceholder')}
          placeholderTextColor={theme.muted}
          selectionColor={colors.orange}
          style={[styles.urlInput, { backgroundColor: theme.input, borderColor: error ? colors.red : theme.border, color: theme.text }]}
          value={url}
        />
        <PrimaryButton
          compact
          icon="download-outline"
          disabled={assignmentRunning && busy !== 'download'}
          label={assignment?.status === 'paused' || assignment?.status === 'error' ? t('resumeAssignment') : t('downloadAssignment')}
          loading={busy === 'download' || assignmentRunning}
          onPress={() => void download()}
          style={styles.actionButton}
        />
        <PrimaryButton
          compact
          icon="document-outline"
          disabled={assignmentRunning}
          label={t('importAssignment')}
          loading={busy === 'import'}
          onPress={() => void importDocument()}
          style={styles.secondaryButton}
          variant="outline"
        />
        {state.pack.source !== 'bundled' && !assignmentRunning ? (
          <Pressable onPress={useSamplePack} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <Ionicons color={theme.muted} name="refresh-outline" size={17} />
            <Text style={[styles.textButtonLabel, { color: theme.muted }]}>{t('samplePack')}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardHeading}>
          <IconTile backgroundColor={theme.successSoft} color={theme.success} name="share-outline" />
          <View style={styles.headingText}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('exports')}</Text>
            <Text style={[styles.cardBody, { color: theme.muted }]}>{t('exportsBody')}</Text>
          </View>
        </View>
        <View style={[styles.exportCount, { backgroundColor: theme.faint }]}>
          <Text style={[styles.exportCountNumber, { color: theme.text }]}>{annotationCount}</Text>
          <Text style={[styles.exportCountLabel, { color: theme.muted }]}>{t('exportCurrentLabel')}</Text>
        </View>
        <PrimaryButton
          compact
          icon="share-outline"
          label={busy === 'export' ? t('exporting') : t('exportPartial')}
          loading={busy === 'export'}
          onPress={() => void exportAnnotations()}
          style={styles.actionButton}
        />
      </Card>

      {message ? (
        <View style={[styles.feedback, { backgroundColor: theme.successSoft }]}>
          <Ionicons color={theme.success} name="checkmark-circle" size={21} />
          <Text style={[styles.successText, { color: theme.success }]}>{message}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.feedback, { backgroundColor: theme.redSoft }]}>
          <Ionicons color={colors.red} name="alert-circle" size={21} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.stat}>
      <Ionicons color={theme.info} name={icon} size={19} />
      <Text numberOfLines={2} style={[styles.statLabel, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  titleText: { flex: 1, minWidth: 0 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7 },
  titleCaption: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  card: { marginBottom: 14 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  headingText: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  cardTitle: { fontSize: 17, fontWeight: '900', marginTop: 2 },
  cardBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  packStats: { flexDirection: 'row', borderRadius: 16, padding: 13, marginTop: 17 },
  stat: { flex: 1, alignItems: 'center', gap: 6 },
  statLabel: { textAlign: 'center', fontSize: 10, lineHeight: 13, fontWeight: '700' },
  verticalDivider: { width: 1, marginVertical: 3 },
  assignmentProgress: { marginTop: 14 },
  progressTrack: { height: 8, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6, backgroundColor: colors.orange },
  progressLabels: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 8 },
  progressText: { flex: 1, fontSize: 11, fontWeight: '800' },
  progressPercent: { fontSize: 11, fontWeight: '800' },
  urlInput: { height: 54, borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 15, marginTop: 18, fontSize: 14 },
  actionButton: { marginTop: 13 },
  secondaryButton: { marginTop: 10 },
  textButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 15, padding: 5 },
  textButtonLabel: { fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  exportCount: { flexDirection: 'row', alignItems: 'baseline', gap: 8, borderRadius: 15, padding: 14, marginTop: 16 },
  exportCountNumber: { fontSize: 24, fontWeight: '900' },
  exportCountLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
  feedback: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 16, padding: 14, marginBottom: 14 },
  successText: { flex: 1, fontSize: 13, fontWeight: '700' },
  errorText: { flex: 1, color: colors.red, fontSize: 13, fontWeight: '700' },
});
