import Ohio from './Ohio';

// ── State template registry ───────────────────────────────────────────────────
// To add a new state:
//   1. Create  src/templates/NewState.js  (copy Ohio.js as a starting point)
//   2. Import it here and add one line below
//   3. That's it — it will appear automatically in the preview and download

export const TEMPLATES = {
  Ohio,
  // Texas: Texas,
  // Florida: Florida,
};

export const DEFAULT_TEMPLATE = 'Ohio';
