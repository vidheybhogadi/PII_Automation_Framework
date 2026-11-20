/**
 * Save-and-restore for the vernac team accounts (QA lead 2026-11-11): every case that changes a name or the hide
 * setting saves the original FIRST and puts it back in teardown — even when the case fails — then checks the
 * restore (CMS view = original name, Postgres = original name, DB hide flag = original).
 *
 * Originals are taken from the CMS view (GET /admin/users/:ref: first_name through the PII getter, gender, date of
 * birth, phone code id and number) and the DB hide flag. A user whose Postgres name differs from its PII name BEFORE
 * the case (an earlier divergence) is refused for writes.
 *
 * A local journal (reports/m2fn-vn/restore-journal.json, git-ignored) records every saved original until it is
 * restored, so `npm run m2fn:vn:restore` can finish an interrupted run. It holds only team test accounts’ names.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { VnApp } from './guard';

export interface Original {
  key: string;
  app: VnApp;
  userId: string;
  ref: string;
  label: string;
  firstName: string;
  gender: string;
  dateOfBirth: string;
  phoneCodeId: number | string;
  number: string;
  hide: boolean;
  savedAt: string;
}

export const JOURNAL = path.resolve(__dirname, '../../../reports/m2fn-vn/restore-journal.json');

export function readJournal(file: string = JOURNAL): Original[] {
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Original[];
  } catch {
    return [];
  }
}

function writeJournal(entries: Original[], file: string = JOURNAL): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(entries, null, 2));
}

/** Add an original (keeps an earlier unrestored one for the same user: that is the true original). */
export function journalAdd(o: Original, file: string = JOURNAL): Original {
  const all = readJournal(file);
  const earlier = all.find((x) => x.key === o.key);
  if (earlier) return earlier;
  writeJournal([...all, o], file);
  return o;
}

export function journalDone(key: string, file: string = JOURNAL): void {
  writeJournal(
    readJournal(file).filter((x) => x.key !== key),
    file,
  );
}

/** The CMS update_profile / approve_and_edit body that keeps every other field as it is. */
export function editBody(o: Original, firstName: string): Record<string, unknown> {
  return {
    ref: o.ref,
    first_name: firstName,
    gender: o.gender,
    date_of_birth: o.dateOfBirth,
    phone_code_id: o.phoneCodeId,
    fetch_only_number: o.number,
  };
}
