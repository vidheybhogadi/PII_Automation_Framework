/** HTTP methods the shared client can send. M1 uses GET/POST only; M2 inventory routes may use any of these. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
