/*
    Copyright 2020 SOLTECSIS SOLUCIONES TECNOLOGICAS, SLU
    https://soltecsis.com
    info@soltecsis.com


    This file is part of FWCloud (https://fwcloud.net).

    FWCloud is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    FWCloud is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with FWCloud.  If not, see <https://www.gnu.org/licenses/>.
*/

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { LogsService } from '../src/logs/logs.service';
import { Apps, Versions } from '../src/updates/updates.model';
import { UpdatesService } from '../src/updates/updates.service';

const COOKIE_NAME = 'FWCloud.net-cookie';

interface HttpResult {
  status: number;
  body: unknown;
}

describe('Updates API authorization (e2e)', () => {
  let app: INestApplication | undefined;
  let port: number;
  let installDir: string;
  let originalApiInstallDir: string | undefined;
  let sessionCount = 0;

  // Mocks keep requests away from update commands, Git, the network and log files.
  const updatesService = {
    compareVersions: jest.fn<Promise<Versions | null>, [Apps]>(),
    runUpdate: jest.fn<Promise<void>, [Apps]>(),
  };
  const logsService = { http: jest.fn(), info: jest.fn(), error: jest.fn() };

  const versions: Versions = {
    current: '2.0.0',
    last: '2.1.0',
    needsUpdate: true,
  };

  const createSession = (overrides: Record<string, unknown> = {}): string => {
    const sessionId = `synthetic-session-${++sessionCount}`;
    const session = {
      cookie: { maxAge: 3600000 },
      customer_id: 1,
      user_id: 1,
      username: 'fwcadmin',
      pgp: 'synthetic-pgp-public-key',
      admin_role: true,
      ...overrides,
    };
    fs.writeFileSync(
      path.join(installDir, 'sessions', `${sessionId}.json`),
      JSON.stringify(session),
    );
    return `${COOKIE_NAME}=${encodeURIComponent(`s:${sessionId}.signature`)}`;
  };

  const request = (
    method: string,
    urlPath: string,
    cookie?: string,
  ): Promise<HttpResult> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          method,
          path: urlPath,
          // A dedicated agent closes the connection after each response.
          agent: false,
          headers: cookie ? { Cookie: cookie } : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: res.statusCode ?? 0,
              body: text ? (JSON.parse(text) as unknown) : undefined,
            });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });

  beforeAll(async () => {
    installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwcloud-updater-e2e-'));
    fs.mkdirSync(path.join(installDir, 'sessions'));
    originalApiInstallDir = process.env.API_INSTALL_DIR;
    process.env.API_INSTALL_DIR = installDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(UpdatesService)
      .useValue(updatesService)
      .overrideProvider(LogsService)
      .useValue(logsService)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    // Same bootstrap order as src/main.ts.
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    port = ((app.getHttpServer() as http.Server).address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app?.close();
    if (originalApiInstallDir === undefined) {
      delete process.env.API_INSTALL_DIR;
    } else {
      process.env.API_INSTALL_DIR = originalApiInstallDir;
    }
    fs.rmSync(installDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    updatesService.compareVersions.mockResolvedValue(versions);
    updatesService.runUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it.each([
    ['PUT', '/updates/api'],
    ['PUT', '/updates/ui'],
    ['PUT', '/updates/websrv'],
    ['GET', '/updates'],
  ])(
    'rejects unauthenticated %s %s with 403 before reaching the service',
    async (method, urlPath) => {
      const res = await request(method, urlPath);

      expect(res).toEqual({
        status: 403,
        body: { statusCode: 403, message: `Cookie ${COOKIE_NAME} not found` },
      });
      expect(updatesService.runUpdate).not.toHaveBeenCalled();
      expect(updatesService.compareVersions).not.toHaveBeenCalled();
      expect(logsService.http).toHaveBeenCalledWith(
        expect.stringContaining(`|HTTP/1.1|${method}|${urlPath}`),
      );
    },
  );

  it.each([
    ['non-administrator', () => createSession({ admin_role: false })],
    ['expired', () => createSession({ cookie: { maxAge: 0 } })],
    [
      'unknown',
      () =>
        `${COOKIE_NAME}=${encodeURIComponent('s:forged-session.signature')}`,
    ],
  ])('does not run updates for %s sessions', async (_case, cookieFor) => {
    const res = await request('PUT', '/updates/api', cookieFor());

    expect(res.status).toBe(403);
    expect(updatesService.runUpdate).not.toHaveBeenCalled();
  });

  it('returns update information to a valid administrator session', async () => {
    const res = await request('GET', '/updates', createSession());

    expect(res).toEqual({
      status: 200,
      body: {
        websrv: versions,
        ui: versions,
        api: versions,
        updater: versions,
      },
    });
    expect(updatesService.compareVersions).toHaveBeenCalledTimes(4);
  });

  it('runs the requested update for a valid administrator session', async () => {
    const res = await request('PUT', '/updates/api', createSession());

    expect(res.status).toBe(200);
    expect(updatesService.runUpdate.mock.calls).toEqual([[Apps.API]]);
  });
});
