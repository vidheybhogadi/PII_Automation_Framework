/**
 * Minimal local HTTP server for the M2 client self-tests: records what the client puts on the wire and answers with
 * canned replies. It is NOT a mock of Aisle and says nothing about the real APIs.
 */
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export class CaptureServer {
  readonly requests: CapturedRequest[] = [];
  private readonly queue: { status: number; body?: string; headers?: Record<string, string> }[] = [];
  private server: Server | undefined;
  baseUrl = '';

  enqueue(...r: { status: number; body?: string; headers?: Record<string, string> }[]): void {
    this.queue.push(...r);
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
          body: Buffer.concat(chunks).toString('utf8'),
        });
        const next = this.queue.shift() ?? { status: 401, body: '{"unauthorized_request":true}' };
        res.writeHead(next.status, { 'content-type': 'application/json', ...next.headers });
        res.end(next.body ?? '');
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}
