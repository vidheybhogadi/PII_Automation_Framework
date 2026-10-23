/**
 * The HTTP client moved to core/http/base-api-client.ts (shared with Milestone 2, 2026-10-23). This re-export keeps
 * every M1 import unchanged; M1's `EndpointDefinition` satisfies the generic `RequestSpec`.
 */
export * from '../../../core/http/base-api-client';
