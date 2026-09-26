/** Plain-English names for everything a reader sees. The report avoids jargon; technical terms stay in tooltips. */
import type { AreaKey } from '../../core/types';

export interface PlainArea {
  name: string;
  /** One short sentence: what "passing" means for this area. */
  means: string;
  group: 'security' | 'features';
  icon: string;
}

export const PLAIN_AREAS: Partial<Record<AreaKey, PlainArea>> = {
  authentication: {
    name: 'Request signing',
    means: 'Only signed, untampered requests are accepted',
    group: 'security',
    icon: 'signature',
  },
  authorization: {
    name: 'Permissions',
    means: 'Each caller can only do what it is allowed to',
    group: 'security',
    icon: 'key',
  },
  tenantIsolation: {
    name: 'Tenant isolation',
    means: 'One customer’s data never leaks to another',
    group: 'security',
    icon: 'users',
  },
  database: {
    name: 'Encrypted storage',
    means: 'Data is stored locked, against the right person',
    group: 'security',
    icon: 'database',
  },
  responseSecurity: {
    name: 'Leak protection',
    means: 'No personal data in errors, logs or caches',
    group: 'security',
    icon: 'eyeOff',
  },
  poc: {
    name: 'End-to-end check',
    means: 'Save → store encrypted → read back works',
    group: 'security',
    icon: 'route',
  },
  write: {
    name: 'Saving data',
    means: 'Personal data can be created and updated',
    group: 'features',
    icon: 'zap',
  },
  read: {
    name: 'Reading data',
    means: 'Stored data is returned correctly',
    group: 'features',
    icon: 'search',
  },
  search: {
    name: 'Search',
    means: 'People can be found by email or phone',
    group: 'features',
    icon: 'search',
  },
  batch: {
    name: 'Bulk read',
    means: 'Many people can be read in one request',
    group: 'features',
    icon: 'layers',
  },
  normalization: {
    name: 'Data clean-up',
    means: 'Emails, phones and names are tidied consistently',
    group: 'features',
    icon: 'sparkles',
  },
  transient: {
    name: 'Temporary phones',
    means: 'Short-lived phone numbers work and expire safely',
    group: 'features',
    icon: 'clock',
  },
  freeText: {
    name: 'Encryption keys',
    means: 'Keys can be issued, read and revoked',
    group: 'features',
    icon: 'lock',
  },
  contract: {
    name: 'API contract',
    means: 'Responses match the documented format',
    group: 'features',
    icon: 'requirement',
  },
  health: {
    name: 'Service health',
    means: 'The service reports that it is ready',
    group: 'features',
    icon: 'activity',
  },
};

export function plainArea(key: AreaKey): PlainArea {
  return (
    PLAIN_AREAS[key] ?? { name: 'Other checks', means: 'Additional checks', group: 'features', icon: 'box' }
  );
}

/** "PII-WR-001 creating a new field returns 201 …" → "Creating a new field returns 201 …" */
export function plainTitle(title: string): string {
  const t = title.replace(/^\S+\s/, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
