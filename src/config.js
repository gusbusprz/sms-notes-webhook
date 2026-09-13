/**
 * Single source of truth for the Status values, shared by the Worker and the
 * board UI. These must match the Airtable single-select options EXACTLY,
 * including capitalisation ("In progress", not "In Progress").
 *
 * To change your workflow, edit this list and the Airtable field together.
 * Nothing else in the codebase hardcodes a status.
 */
export const STATUSES = ['Uncategorized', 'To Do', 'In progress', 'Done'];

/**
 * Where a newly received text lands. Must be one of STATUSES.
 *
 * Inbound texts arrive UNTRIAGED. Moving one to "To Do" is a deliberate act:
 * it means you have read it and decided it is real work. That keeps capture
 * and triage as separate steps rather than dumping raw thoughts into a queue
 * that is supposed to mean something.
 */
export const INBOX_STATUS = 'Uncategorized';

/** Where a note goes if its stored status is unrecognised. */
export const FALLBACK_STATUS = 'Uncategorized';

/** Case-insensitive match, so capitalisation drift in Airtable cannot break reads. */
export function normalizeStatus(value) {
  if (typeof value !== 'string') return FALLBACK_STATUS;
  const hit = STATUSES.find((s) => s.toLowerCase() === value.trim().toLowerCase());
  return hit || FALLBACK_STATUS;
}
