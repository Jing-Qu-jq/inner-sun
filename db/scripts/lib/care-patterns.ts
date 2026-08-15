// Shared row shape for the Care Pattern scripts (export, pull, reembed).
//
// Note what is deliberately absent: `embedding`. A vector is derived data — 1536 floats
// that any machine can regenerate from `situation` — so it is excluded from exports.
// Including it would make the backup file unreadable, produce meaningless diffs on every
// change, and bloat the repo, all to store something reproducible in one command.

/** Columns every Care Pattern script selects. Kept as one string so they cannot drift. */
export const CARE_PATTERN_COLUMNS =
  "id, title, situation, signals, strategies, avoid, escalation, source_refs, locale_notes, is_active";

/** A `care_patterns` row as pg returns it (snake_case, arrays already parsed). */
export interface CarePatternRow {
  id: string;
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  source_refs: string[];
  locale_notes: Record<string, string>;
  is_active: boolean;
}

/** The camelCase form written to the export file — matches the seed file's shape. */
export interface ExportedCarePattern {
  id: string;
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  sourceRefs: string[];
  localeNotes: Record<string, string>;
  isActive: boolean;
}

export function toExported(row: CarePatternRow): ExportedCarePattern {
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    signals: row.signals,
    strategies: row.strategies,
    avoid: row.avoid,
    escalation: row.escalation,
    sourceRefs: row.source_refs,
    localeNotes: row.locale_notes ?? {},
    isActive: row.is_active,
  };
}
