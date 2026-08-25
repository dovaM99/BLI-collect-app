import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card } from '../components/Card';
import { IconTile } from '../components/IconTile';
import {
  browseLexemes,
  getLexiconIndex,
  isLexiconLanguageAvailable,
  LEXICON_LANGUAGE_ORDER,
  lexiconLabel,
  lexiconShortLabel,
  lookupLexicon,
  translationsFor,
  type Lexeme,
  type LexiconIndex,
  type LexiconLanguage,
  type LexiconSuggestion,
} from '../services/lexicon';
import { useApp } from '../state/AppContext';
import { colors, layout } from '../theme';

const MAX_SUGGESTIONS = 5;
const ROW_HEIGHT = 58;
const ROW_GAP = 9;

/** Une ligne de la liste : soit un resultat de recherche, soit une entree parcourue. */
type Row = {
  key: string;
  entryId: number;
  displayForm: string;
  language: LexiconLanguage;
  isCloseMatch: boolean;
};

function rowFromSuggestion(suggestion: LexiconSuggestion): Row {
  return {
    key: suggestion.id,
    entryId: Number(suggestion.entryId),
    displayForm: suggestion.displayForm,
    language: suggestion.language,
    isCloseMatch: suggestion.matchType === 'fuzzy',
  };
}

function rowFromLexeme(lexeme: Lexeme): Row {
  return {
    key: lexeme.id,
    entryId: lexeme.entryId,
    displayForm: lexeme.displayForm,
    language: lexeme.language,
    isCloseMatch: false,
  };
}

export function LexiconScreen() {
  const { t, theme } = useApp();
  const [index, setIndex] = useState<LexiconIndex | null>(null);
  const [query, setQuery] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<LexiconLanguage>('fr');
  const [targetLanguage, setTargetLanguage] = useState<LexiconLanguage>('ln');
  const [selected, setSelected] = useState<Row | null>(null);

  // L'index est bati apres la premiere peinture : l'ecran s'affiche
  // immediatement, meme sur un telephone lent.
  useEffect(() => {
    const timer = setTimeout(() => setIndex(getLexiconIndex()), 0);
    return () => clearTimeout(timer);
  }, []);

  const sourceOptions = useMemo(
    () => (index ? LEXICON_LANGUAGE_ORDER.filter((language) => isLexiconLanguageAvailable(language, index)) : []),
    [index],
  );

  const targetOptions = useMemo(
    () => LEXICON_LANGUAGE_ORDER.filter((language) => language !== sourceLanguage),
    [sourceLanguage],
  );

  useEffect(() => {
    if (!index) return;
    if (targetLanguage === sourceLanguage || !isLexiconLanguageAvailable(targetLanguage, index)) {
      const fallback = targetOptions.find((language) => isLexiconLanguageAvailable(language, index));
      if (fallback) setTargetLanguage(fallback);
    }
  }, [index, sourceLanguage, targetLanguage, targetOptions]);

  /** Liste parcourue quand la recherche est vide. */
  const browseRows = useMemo(
    () => (index ? browseLexemes(index, sourceLanguage).map(rowFromLexeme) : []),
    [index, sourceLanguage],
  );

  const searching = query.trim().length > 0;

  const rows = useMemo(() => {
    if (!index) return [] as Row[];
    if (!searching) return browseRows;
    return lookupLexicon({ query, sourceLanguage, limit: MAX_SUGGESTIONS }, index).map(rowFromSuggestion);
  }, [browseRows, index, query, searching, sourceLanguage]);

  const renderRow = useCallback(({ item }: { item: Row }) => {
    const targets = index ? translationsFor(item.entryId, targetLanguage, index) : [];
    return (
      <Pressable
        onPress={() => setSelected(item)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.rowSide}>
          <Text numberOfLines={1} style={[styles.rowWord, { color: theme.text }]}>
            {item.displayForm}
          </Text>
          <Badge background={theme.blueSoft} color={theme.info} label={lexiconShortLabel(item.language)} />
        </View>
        <Ionicons color={theme.muted} name="arrow-forward" size={18} />
        <View style={styles.rowSide}>
          <Text numberOfLines={1} style={[styles.rowWord, { color: theme.text }]}>
            {targets[0] ?? '—'}
          </Text>
          {targets.length > 1 ? (
            <Badge background={theme.faint} color={theme.muted} label={`+${targets.length - 1}`} />
          ) : null}
        </View>
        {item.isCloseMatch ? <View style={[styles.closeDot, { backgroundColor: theme.warning }]} /> : null}
      </Pressable>
    );
  }, [index, targetLanguage, theme]);

  const header = (
    <View>
      <View style={styles.titleRow}>
        <IconTile backgroundColor={theme.orangeSoft} color={theme.warning} name="book-outline" size={28} />
        <View style={styles.titleText}>
          <Text style={[styles.title, { color: theme.text }]}>{t('lexicon')}</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{t('lexiconSubtitle')}</Text>
        </View>
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons color={theme.muted} name="search-outline" size={22} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder={t('lexiconSearchIn', { language: lexiconLabel(sourceLanguage) })}
          placeholderTextColor={theme.muted}
          selectionColor={colors.orange}
          style={[styles.searchInput, { color: theme.text }]}
          value={query}
        />
        {query.length > 0 ? (
          <Pressable accessibilityLabel={t('clear')} hitSlop={10} onPress={() => setQuery('')}>
            <Ionicons color={theme.muted} name="close-circle" size={21} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.languageRow}>
        <Card style={styles.languageCard}>
          <View style={styles.languageHeading}>
            <IconTile backgroundColor={theme.blueSoft} color={theme.info} name="globe-outline" />
            <Text style={[styles.languageTitle, { color: theme.text }]}>{t('sourceLanguage')}</Text>
          </View>
          <View style={styles.chipWrap}>
            {sourceOptions.map((language) => (
              <Chip
                key={language}
                active={sourceLanguage === language}
                label={lexiconShortLabel(language)}
                onPress={() => setSourceLanguage(language)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.languageCard}>
          <View style={styles.languageHeading}>
            <IconTile backgroundColor={theme.successSoft} color={theme.success} name="locate-outline" />
            <Text style={[styles.languageTitle, { color: theme.text }]}>{t('targetLanguageLexicon')}</Text>
          </View>
          <View style={styles.chipColumn}>
            {targetOptions.map((language) => {
              const available = index ? isLexiconLanguageAvailable(language, index) : false;
              return (
                <Chip
                  key={language}
                  active={targetLanguage === language}
                  disabled={!available}
                  full
                  hint={available ? undefined : t('lexiconComingSoon')}
                  label={lexiconLabel(language)}
                  onPress={() => setTargetLanguage(language)}
                />
              );
            })}
          </View>
        </Card>
      </View>

      <Card style={styles.resultsHeader}>
        <IconTile backgroundColor={theme.orangeSoft} color={theme.warning} name="book-outline" />
        <View style={styles.resultsHeaderText}>
          <Text style={[styles.resultsTitle, { color: theme.text }]}>
            {searching ? t('results') : t('lexiconAllWords')}
          </Text>
          <Text style={[styles.resultsCaption, { color: theme.muted }]}>
            {!index
              ? t('lexiconLoading')
              : searching
                ? t('lexiconResultCount', { count: rows.length })
                : t('lexiconBrowseCount', { count: rows.length })}
          </Text>
        </View>
      </Card>

      {searching && rows.some((row) => row.isCloseMatch) ? (
        <View style={styles.closeNote}>
          <View style={[styles.closeDot, styles.closeDotInline, { backgroundColor: theme.warning }]} />
          <Text style={[styles.closeNoteText, { color: theme.muted }]}>{t('lexiconFuzzyNote')}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <FlatList
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.placeholder}>
            {!index ? (
              <ActivityIndicator color={colors.orange} />
            ) : (
              <>
                <Ionicons color={theme.muted} name="alert-circle-outline" size={30} />
                <Text style={[styles.placeholderText, { color: theme.text }]}>{t('lexiconNoResult')}</Text>
                <Text style={[styles.placeholderText, { color: theme.muted }]}>{t('lexiconNoResultHint')}</Text>
              </>
            )}
          </View>
        }
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        data={rows}
        getItemLayout={(_, position) => ({
          length: ROW_HEIGHT,
          offset: (ROW_HEIGHT + ROW_GAP) * position,
          index: position,
        })}
        initialNumToRender={12}
        keyExtractor={(item) => item.key}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        renderItem={renderRow}
        windowSize={7}
      />
      <WordSheet index={index} onClose={() => setSelected(null)} selection={selected} />
    </View>
  );
}

function Chip({
  active,
  disabled,
  full,
  hint,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  full?: boolean;
  hint?: string;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        full && styles.chipFull,
        {
          backgroundColor: active ? colors.navy : theme.input,
          borderColor: active ? colors.navy : theme.border,
          opacity: disabled ? 0.45 : 1,
        },
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.chipLabel, { color: active ? colors.white : theme.text }]}>
        {label}
      </Text>
      {hint ? <Text style={[styles.chipHint, { color: theme.muted }]}>{hint}</Text> : null}
    </Pressable>
  );
}

function Badge({ background, color, label }: { background: string; color: string; label: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

function WordSheet({
  index,
  onClose,
  selection,
}: {
  index: LexiconIndex | null;
  onClose: () => void;
  selection: Row | null;
}) {
  const { t, theme } = useApp();
  if (!selection || !index) return null;

  const blocks = LEXICON_LANGUAGE_ORDER
    .map((language) => ({ language, variants: translationsFor(selection.entryId, language, index) }))
    .filter((block) => block.variants.length > 0);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <Pressable onPress={onClose} style={styles.sheetBackdrop} />
      <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{selection.displayForm}</Text>
          <Pressable accessibilityLabel={t('close')} hitSlop={10} onPress={onClose}>
            <Ionicons color={theme.muted} name="close" size={26} />
          </Pressable>
        </View>
        {selection.isCloseMatch ? (
          <Text style={[styles.sheetFuzzy, { color: theme.warning }]}>{t('lexiconCloseMatch')}</Text>
        ) : null}
        <ScrollView style={styles.sheetScroll}>
          {blocks.map((block) => (
            <View key={block.language} style={[styles.sheetBlock, { borderTopColor: theme.border }]}>
              <Text style={[styles.sheetLanguage, { color: theme.muted }]}>{lexiconLabel(block.language)}</Text>
              {block.variants.map((variant) => (
                <Text key={`${block.language}-${variant}`} style={[styles.sheetVariant, { color: theme.text }]}>
                  {variant}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    padding: layout.screenPadding,
    paddingBottom: 30,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  titleText: { flex: 1, minWidth: 0 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 58,
    borderWidth: 1.5,
    borderRadius: layout.radiusMedium,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 16, fontWeight: '600' },
  languageRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  languageCard: { flex: 1, padding: 14 },
  languageHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  languageTitle: { flex: 1, fontSize: 12, fontWeight: '900' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  chipColumn: { gap: 7, marginTop: 12 },
  chip: {
    minHeight: 38,
    borderWidth: 1.5,
    borderRadius: layout.radiusSmall,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipFull: { width: '100%' },
  chipLabel: { fontSize: 13, fontWeight: '800' },
  chipHint: { fontSize: 9, fontWeight: '700', marginTop: 1 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, marginBottom: 12 },
  resultsHeaderText: { flex: 1 },
  resultsTitle: { fontSize: 17, fontWeight: '900' },
  resultsCaption: { fontSize: 11, marginTop: 3 },
  closeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 12 },
  closeNoteText: { flex: 1, fontSize: 11, lineHeight: 15 },
  separator: { height: ROW_GAP },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: layout.radiusMedium,
    paddingHorizontal: 14,
  },
  rowSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  rowWord: { flexShrink: 1, fontSize: 15, fontWeight: '800' },
  badge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  badgeLabel: { fontSize: 9, fontWeight: '900' },
  closeDot: { width: 7, height: 7, borderRadius: 4 },
  closeDotInline: { marginTop: 4 },
  placeholder: { alignItems: 'center', gap: 8, paddingVertical: 34 },
  placeholderText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.65 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(6, 20, 36, 0.45)' },
  sheet: {
    maxHeight: '72%',
    borderTopWidth: 1,
    borderTopLeftRadius: layout.radiusLarge,
    borderTopRightRadius: layout.radiusLarge,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 30,
  },
  sheetHandle: { width: 44, height: 4, borderRadius: 3, alignSelf: 'center', marginTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  sheetTitle: { flex: 1, fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  sheetFuzzy: { fontSize: 12, fontWeight: '800', marginTop: 4 },
  sheetScroll: { marginTop: 10 },
  sheetBlock: { borderTopWidth: 1, paddingVertical: 13 },
  sheetLanguage: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  sheetVariant: { fontSize: 17, fontWeight: '700', marginTop: 5 },
});
