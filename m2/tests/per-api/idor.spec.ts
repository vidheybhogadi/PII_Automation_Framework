/**
 * Per-API IDOR checks (Cannot act on / read another user), generated from the M2 design.
 * User A sends the route with user B's identifiers. Pass = B's phone (national / full) and known fake email never
 * appear in A's reply and B's FULL own profile (stable fields + about text, own-view.ts) is unchanged afterwards.
 * A request that names no user / profile id (no REF / USER_ID / OTHER_*) cannot carry B's ids → Blocked, never a pass
 * (audit fix 2026-10-25).
 */
import { defineChecks } from '../../src/checks/define';
import { runIdor } from '../../src/checks/per-api';

defineChecks('IDOR', 'M2 per-API checks — cannot act on another user (IDOR)', runIdor);
