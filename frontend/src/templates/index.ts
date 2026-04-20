import * as Ohio from './ohio';

// ── State template registry ──────────────────────────────────────────────────
// To add a new state:
//   1. Create  src/templates/NewState/  (copy ohio/ as a starting point)
//   2. Import it here and add one line below
//   3. It will appear automatically in the preview and download

export const TEMPLATES = {
  Ohio,
  // Texas,
  // Florida,
} as const;

export const DEFAULT_TEMPLATE = 'Ohio' as const;

export type TemplateId = keyof typeof TEMPLATES;
