import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { writeExportFile } from '../services/dataFiles';
import { useApp } from '../state/AppContext';
import { colors } from '../theme';
import { annotationKey } from '../utils/annotationKey';
import { resolveMinWords, resolvePrompt, TARGET_LANGUAGE_LABELS } from '../utils/targetLanguages';

type Props = {
  onLeave: () => void;
  onFiles: () => void;
};

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}

export function WorkScreen({ onLeave, onFiles }: Props) {
  const {
    ensureSession,
    noteItemShown,
    setCurrentIndex,
    state,
    snapshot,
    t,
    theme,
    updateDraft,
    validateAnnotation,
  } = useApp();
  const initialized = useRef(false);
  const previousItemCount = useRef(state.pack.items.length);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const session = ensureSession();
    if (!session || session.currentIndex !== 0) return;
    const firstIncomplete = state.pack.items.findIndex((candidate) => {
      const annotation = state.annotations[
        annotationKey(state.pack.id, state.pack.targetLanguage, candidate.id)
      ];
      return annotation?.status !== 'validated';
    });
    if (firstIncomplete > 0) setCurrentIndex(firstIncomplete);
  }, [ensureSession, setCurrentIndex, state.annotations, state.pack.id, state.pack.items]);

  useEffect(() => {
    if (state.pack.items.length <= previousItemCount.current) {
      previousItemCount.current = state.pack.items.length;
      return;
    }
    previousItemCount.current = state.pack.items.length;
    const activeSession = state.sessions.find((candidate) => candidate.id === state.activeSessionId);
    const currentItem = state.pack.items[activeSession?.currentIndex ?? 0];
    const key = (taskId: string) => annotationKey(state.pack.id, state.pack.targetLanguage, taskId);
    if (!currentItem || state.annotations[key(currentItem.id)]?.status !== 'validated') return;
    const nextIncomplete = state.pack.items.findIndex(
      (candidate) => state.annotations[key(candidate.id)]?.status !== 'validated',
    );
    if (nextIncomplete >= 0) setCurrentIndex(nextIncomplete);
  }, [setCurrentIndex, state.activeSessionId, state.annotations, state.pack.id, state.pack.items, state.sessions]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onLeave();
      return true;
    });
    return () => subscription.remove();
  }, [onLeave]);

  const session = state.sessions.find((candidate) => candidate.id === state.activeSessionId);
  const currentIndex = session?.currentIndex ?? 0;
  const item = state.pack.items[currentIndex] ?? state.pack.items[0];
  const itemId = item?.id;

  // Repère de départ pour mesurer le délai avant la première frappe.
  useEffect(() => {
    if (itemId) noteItemShown(itemId);
  }, [itemId, noteItemShown]);

  if (!item) {
    return (
      <Screen>
        <Text style={[styles.empty, { color: theme.text }]}>{t('emptyPack')}</Text>
        <PrimaryButton label={t('files')} onPress={onFiles} />
      </Screen>
    );
  }

  const annotation = state.annotations[
    annotationKey(state.pack.id, state.pack.targetLanguage, item.id)
  ];
  const value = annotation?.text ?? '';
  const words = countWords(value);
  const imageSource = item.imageUri ? { uri: item.imageUri } : item.bundledImage;
  const photoSourceUrl = typeof item.metadata?.sourceUrl === 'string'
    && item.metadata.sourceUrl.startsWith('https://commons.wikimedia.org/')
    ? item.metadata.sourceUrl : null;
  const photoLicenseUrl = typeof item.metadata?.licenseUrl === 'string'
    && item.metadata.licenseUrl.startsWith('https://creativecommons.org/')
    ? item.metadata.licenseUrl : null;
  const openCreditLink = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert(t('photoLinkError')));
  };
  const progress = ((currentIndex + 1) / state.pack.items.length) * 100;
  const workingLanguage = state.pack.targetLanguage;
  const prompt = resolvePrompt(item, workingLanguage, state.preferences.language);
  const minWords = resolveMinWords(item, workingLanguage);
  const validLength = words >= minWords;

  const goTo = (index: number) => {
    setAttempted(false);
    setCurrentIndex(index);
  };

  const validate = () => {
    setAttempted(true);
    if (!validLength) return;

    const result = validateAnnotation(item.id, value);
    setAttempted(false);

    if (result.complete) {
      void writeExportFile(snapshot()).catch(() => undefined);
      Alert.alert(t('packComplete'), t('packCompleteBody'), [
        { text: t('dashboard'), onPress: onLeave },
        { text: t('viewFiles'), onPress: onFiles },
      ]);
      return;
    }

    const nextIncomplete = state.pack.items.findIndex((candidate, index) => {
      if (index <= currentIndex) return false;
      return state.annotations[
        annotationKey(state.pack.id, state.pack.targetLanguage, candidate.id)
      ]?.status !== 'validated';
    });
    if (nextIncomplete >= 0) goTo(nextIncomplete);
    else if (currentIndex < state.pack.items.length - 1) goTo(currentIndex + 1);
    else if (state.assignment && state.assignment.status !== 'ready') {
      Alert.alert(t('availableBlockComplete'), t('availableBlockCompleteBody'), [
        { text: t('dashboard'), onPress: onLeave },
        { text: t('viewFiles'), onPress: onFiles },
      ]);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('dashboard')} hitSlop={10} onPress={onLeave} style={styles.headerButton}>
          <Ionicons color={theme.text} name="chevron-back" size={28} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.text }]}>{t('imageTranscription')}</Text>
            <Text style={[styles.headerCaption, { color: theme.success }]}>● {t('savedLocally')}</Text>
        </View>
        <Pressable accessibilityLabel={t('exportPartial')} hitSlop={10} onPress={onFiles} style={styles.headerButton}>
          <Ionicons color={theme.text} name="share-outline" size={25} />
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <View style={[styles.taskProgressTrack, { backgroundColor: theme.border }]}>
          <View style={[styles.taskProgressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={[styles.progressLabel, { color: theme.text }]}>{currentIndex + 1} / {state.pack.items.length}</Text>
      </View>

      <Card style={styles.imageCard}>
        <View style={[styles.imageWrap, { backgroundColor: theme.faint }]}>
          <Image resizeMode="contain" source={imageSource} style={styles.image} />
          {currentIndex > 0 ? (
            <Pressable
              accessibilityLabel={t('previous')}
              onPress={() => goTo(currentIndex - 1)}
              style={[styles.imageArrow, styles.imageArrowLeft, { backgroundColor: theme.surface }]}
            >
              <Ionicons color={theme.text} name="chevron-back" size={27} />
            </Pressable>
          ) : null}
          {currentIndex < state.pack.items.length - 1 ? (
            <Pressable
              accessibilityLabel={t('next')}
              onPress={() => goTo(currentIndex + 1)}
              style={[styles.imageArrow, styles.imageArrowRight, { backgroundColor: theme.surface }]}
            >
              <Ionicons color={theme.text} name="chevron-forward" size={27} />
            </Pressable>
          ) : null}
        </View>
        {item.credit ? <Text style={[styles.credit, { color: theme.muted }]}>{item.credit}</Text> : null}
        {photoSourceUrl || photoLicenseUrl ? (
          <View style={styles.creditLinks}>
            {item.metadata?.source === 'beta' ? (
              <Text style={[styles.creditNote, { color: theme.muted }]}>{t('photoOptimized')}</Text>
            ) : null}
            {photoSourceUrl ? (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openCreditLink(photoSourceUrl)}>
                <Text style={[styles.creditLink, { color: theme.info }]}>{t('photoSource')}</Text>
              </Pressable>
            ) : null}
            {photoLicenseUrl ? (
              <Pressable accessibilityRole="link" hitSlop={8} onPress={() => openCreditLink(photoLicenseUrl)}>
                <Text style={[styles.creditLink, { color: theme.info }]}>{t('photoLicense')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={styles.instructionCard}>
        <IconTile backgroundColor={theme.blueSoft} color={theme.info} name="document-text-outline" />
        <View style={styles.instructionText}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('instruction')}</Text>
          <Text style={[styles.instruction, { color: theme.muted }]}>{prompt}</Text>
          <View style={[styles.languagePill, { backgroundColor: theme.blueSoft }]}>
            <Ionicons color={theme.info} name="chatbubbles-outline" size={15} />
            <Text style={[styles.languagePillText, { color: theme.info }]}>
              {t('writeIn', { language: TARGET_LANGUAGE_LABELS[workingLanguage] })}
            </Text>
          </View>
          <View style={[styles.minimumPill, { backgroundColor: theme.orangeSoft }]}>
            <Ionicons color={theme.warning} name="flag-outline" size={15} />
            <Text style={[styles.minimumText, { color: theme.warning }]}>{t('minimum')} : {minWords} {t('words')}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.textCard}>
        <View style={styles.textTitleRow}>
          <IconTile backgroundColor={theme.successSoft} color={theme.success} name="pencil-outline" />
          <View style={styles.textTitleContent}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('text')}</Text>
            <Text style={[styles.autoSave, { color: theme.muted }]}>{t('draftSaved')}</Text>
          </View>
          {annotation?.status === 'validated' ? <Ionicons color={theme.success} name="checkmark-circle" size={25} /> : null}
        </View>

        <TextInput
          multiline
          onChangeText={(text) => {
            setAttempted(false);
            updateDraft(item.id, text);
          }}
          placeholder={t('textPlaceholder')}
          placeholderTextColor={theme.muted}
          selectionColor={colors.orange}
          style={[
            styles.textInput,
            {
              backgroundColor: theme.input,
              borderColor: attempted && !validLength ? colors.red : theme.border,
              color: theme.text,
            },
          ]}
          textAlignVertical="top"
          value={value}
        />
        <View style={styles.counterRow}>
          <Text style={[styles.rewrite, { color: theme.muted }]}>{t('rewriteHint')}</Text>
          <Text style={[styles.counter, { color: validLength ? theme.success : attempted ? colors.red : theme.warning }]}>
            {words} / {minWords} {t('words')}
          </Text>
        </View>
        {attempted && !validLength ? (
          <Text style={styles.validationError}>{t('missingWords', { count: minWords - words })}</Text>
        ) : null}
      </Card>

      <PrimaryButton
        icon={annotation?.status === 'validated' ? 'checkmark' : 'arrow-forward'}
        label={annotation?.status === 'validated' ? t('validated') : t('validate')}
        onPress={validate}
        style={styles.validateButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  headerCaption: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  taskProgressTrack: {
    flex: 1,
    height: 7,
    borderRadius: 5,
    overflow: 'hidden',
  },
  taskProgressFill: {
    height: '100%',
    backgroundColor: colors.orange,
    borderRadius: 5,
  },
  progressLabel: {
    minWidth: 46,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '900',
  },
  imageCard: { padding: 10 },
  imageWrap: {
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111A24',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageArrow: {
    position: 'absolute',
    top: '44%',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  imageArrowLeft: { left: 12 },
  imageArrowRight: { right: 12 },
  credit: {
    fontSize: 10,
    marginTop: 7,
    marginHorizontal: 7,
    textAlign: 'right',
  },
  creditLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 14, margin: 7 },
  creditNote: { fontSize: 10 },
  creditLink: { fontSize: 11, textDecorationLine: 'underline' },
  instructionCard: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  instructionText: { flex: 1 },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  instruction: { fontSize: 15, lineHeight: 22, marginTop: 5 },
  minimumPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  minimumText: { fontSize: 12, fontWeight: '800' },
  languagePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  languagePillText: { fontSize: 12, fontWeight: '800' },
  textCard: { marginTop: 16 },
  textTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textTitleContent: { flex: 1 },
  autoSave: { fontSize: 10, marginTop: 2 },
  textInput: {
    minHeight: 142,
    borderWidth: 1.5,
    borderRadius: 17,
    padding: 16,
    marginTop: 16,
    fontSize: 16,
    lineHeight: 23,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 10,
  },
  rewrite: { flex: 1, fontSize: 10, lineHeight: 14 },
  counter: { fontSize: 14, fontWeight: '900' },
  validationError: {
    color: colors.red,
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
  },
  validateButton: { marginTop: 18 },
});
