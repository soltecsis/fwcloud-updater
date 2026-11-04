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

import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LogsService } from '../logs/logs.service';
import { AuthMiddleware } from './auth.middleware';

type AuthRequest = Parameters<AuthMiddleware['use']>[0];
type AuthResponse = Parameters<AuthMiddleware['use']>[1];
type Session = Record<string, unknown>;

const COOKIE_NAME = 'FWCloud.net-cookie';

const adminSession = (): Session => ({
  cookie: { maxAge: 3600000 },
  customer_id: 1,
  user_id: 1,
  username: 'fwcadmin',
  pgp: 'synthetic-pgp-public-key',
  admin_role: true,
});

describe('AuthMiddleware', () => {
  let installDir: string;
  let sessionCount = 0;
  let middleware: AuthMiddleware;
  const log = { error: jest.fn() };

  // Writes a synthetic session file and returns a cookie that references it.
  const createSession = (content: Session | string): string => {
    const sessionId = `synthetic-session-${++sessionCount}`;
    fs.writeFileSync(
      path.join(installDir, 'sessions', `${sessionId}.json`),
      typeof content === 'string' ? content : JSON.stringify(content),
    );
    return `s:${sessionId}.synthetic-signature`;
  };

  const runMiddleware = (cookies?: Record<string, string>) => {
    const next = jest.fn();
    let error: unknown;
    try {
      middleware.use({ cookies } as AuthRequest, {} as AuthResponse, next);
    } catch (err) {
      error = err;
    }
    return { error, next };
  };

  const expectForbidden = (
    { error, next }: ReturnType<typeof runMiddleware>,
    message: unknown,
  ) => {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((error as HttpException).message).toEqual(message);
    expect(next).not.toHaveBeenCalled();
    // Node core errors come from another realm, so match by message.
    expect(log.error).toHaveBeenCalledWith(
      'Auth Middleware:',
      expect.objectContaining({ message: (error as HttpException).message }),
    );
  };

  beforeAll(() => {
    installDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fwcloud-updater-auth-'),
    );
    fs.mkdirSync(path.join(installDir, 'sessions'));
  });

  afterAll(() => {
    fs.rmSync(installDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue({ api: { versionURL: '', installDir } }),
    };
    middleware = new AuthMiddleware(
      configService as unknown as ConfigService,
      log as unknown as LogsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests without cookies', () => {
    expectForbidden(runMiddleware(undefined), 'No cookies found');
  });

  it.each([
    ['is missing', { other: 'value' }],
    ['is empty', { [COOKIE_NAME]: '' }],
  ])('rejects requests whose authentication cookie %s', (_case, cookies) => {
    expectForbidden(runMiddleware(cookies), `Cookie ${COOKIE_NAME} not found`);
  });

  it.each([
    ['has no prefix separator', 'synthetic-session.signature'],
    ['has several prefix separators', 's:synthetic:session.signature'],
    ['has no signature separator', 's:synthetic-session'],
    ['has several signature separators', 's:synthetic.session.signature'],
  ])('rejects malformed cookies that %s', (_case, cookie) => {
    expectForbidden(
      runMiddleware({ [COOKIE_NAME]: cookie }),
      'Bad cookie data',
    );
  });

  it('rejects cookies that traverse outside the sessions directory', () => {
    fs.writeFileSync(
      path.join(installDir, 'outside.json'),
      JSON.stringify(adminSession()),
    );

    expectForbidden(
      runMiddleware({ [COOKIE_NAME]: 's:../outside.signature' }),
      'Bad cookie data',
    );
  });

  it('rejects cookies whose session file does not exist', () => {
    expectForbidden(
      runMiddleware({ [COOKIE_NAME]: 's:nonexistent-session.signature' }),
      expect.stringContaining('ENOENT'),
    );
  });

  it.each([
    ['is not valid JSON', 'not a json session'],
    ['has no cookie data', JSON.stringify({ ...adminSession(), cookie: null })],
  ])('rejects sessions whose file %s', (_case, content) => {
    expectForbidden(
      runMiddleware({ [COOKIE_NAME]: createSession(content) }),
      expect.any(String),
    );
  });

  it.each([0, -1])('rejects expired sessions (maxAge %d)', (maxAge) => {
    const cookie = createSession({ ...adminSession(), cookie: { maxAge } });

    expectForbidden(
      runMiddleware({ [COOKIE_NAME]: cookie }),
      'Session expired',
    );
  });

  it.each(['customer_id', 'user_id', 'username', 'pgp', 'admin_role'])(
    'rejects sessions without %s',
    (field) => {
      const session = adminSession();
      delete session[field];

      expectForbidden(
        runMiddleware({ [COOKIE_NAME]: createSession(session) }),
        'Bad session data',
      );
    },
  );

  it('rejects sessions of users without the administrator role', () => {
    const cookie = createSession({ ...adminSession(), admin_role: false });

    expectForbidden(
      runMiddleware({ [COOKIE_NAME]: cookie }),
      'For updates you must be an user with admin role',
    );
  });

  it('allows valid administrator sessions to continue', () => {
    const { error, next } = runMiddleware({
      [COOKIE_NAME]: createSession(adminSession()),
    });

    expect(error).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(log.error).not.toHaveBeenCalled();
  });
});
