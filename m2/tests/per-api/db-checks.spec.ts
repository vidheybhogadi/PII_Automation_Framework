/**
 * Per-API DB checks (read-only PII DB): DB-SAVE, DB-REFUSE, DB-ISOL. Snapshots compare record counts, md5 hashes of
 * the ciphertext and updated times — never values. App users need the PII user_id mapping (M2Q-37); CMS routes a
 * CMS admin (M2Q-04).
 */
import { defineDbChecks } from '../../src/checks/define';
import { runDbIsol, runDbRefuse, runDbSave } from '../../src/checks/per-api';

defineDbChecks('DB-SAVE', 'M2 per-API checks — DB: persisted correctly, no duplicates (DB-SAVE)', runDbSave);
defineDbChecks(
  'DB-REFUSE',
  'M2 per-API checks — DB: refused request writes nothing (DB-REFUSE)',
  runDbRefuse,
);
defineDbChecks('DB-ISOL', 'M2 per-API checks — DB: other fields and users untouched (DB-ISOL)', runDbIsol);
