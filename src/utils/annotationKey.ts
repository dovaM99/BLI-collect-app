import type { Annotation, TargetLanguage } from '../types';

/**
 * Clé d'une annotation dans l'état local.
 *
 * La langue de collecte fait partie de la clé. Sans elle, répondre au même item
 * dans deux langues écrasait silencieusement la première réponse : un collecteur
 * bilingue qui reprend un lot dans une seconde langue détruisait son premier
 * passage. C'est aussi ce qui permet de produire du corpus parallèle sur un même
 * jeu d'images.
 */
export function annotationKey(packId: string, language: TargetLanguage, taskId: string) {
  return `${packId}:${language}:${taskId}`;
}

/** Clé recalculée depuis le contenu : sert aussi à migrer les anciennes clés. */
export function annotationKeyOf(annotation: Pick<Annotation, 'packId' | 'language' | 'taskId'>) {
  return annotationKey(annotation.packId, annotation.language, annotation.taskId);
}
