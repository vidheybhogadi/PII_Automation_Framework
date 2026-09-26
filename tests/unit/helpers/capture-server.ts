/**
 * Minimal local HTTP server for UNIT tests of the client's wire behaviour (bytes, headers, retries).
 * It is NOT a mock of the PII service and its results say nothing about the real service.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  /** The exact bytes received on the socket. */
  body: Buffer;
}

export interface CannedResponse {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

export class CaptureServer {
  readonly requests: CapturedRequest[] = [];
  private readonly queue: CannedResponse[] = [];
  private server: Server | undefined;
  baseUrl = '';

  /** Responses are served in order; when the queue is empty a default 200 envelope is returned. */
  enqueue(...responses: CannedResponse[]): void {
    this.queue.push(...responses);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        this.requests.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: Buffer.concat(chunks),
        });
        const next = this.queue.shift() ?? {
          status: 200,
          body: JSON.stringify({ status: true, message: 'ok', data: {}, error: null }),
        };
        res.writeHead(next.status, { 'content-type': 'application/json', ...next.headers });
        res.end(next.body ?? '');
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}
