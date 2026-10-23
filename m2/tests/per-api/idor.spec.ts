/**
 * Per-API IDOR checks (Cannot act on / read another user), generated from the M2 design.
 * User A sends the route with user B's identifiers. Pass = B's phone never appears in A's reply and B's own view is
 * unchanged afterwards.
 */
import { defineChecks } from '../../src/checks/define';
import { runIdor } from '../../src/checks/per-api';

defineChecks('IDOR', 'M2 per-API checks — cannot act on another user (IDOR)', runIdor);
