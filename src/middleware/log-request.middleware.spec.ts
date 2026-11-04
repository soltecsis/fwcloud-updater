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

import { LogsService } from '../logs/logs.service';
import { LogRequestMiddleware } from './log-request.middleware';

type LogRequest = Parameters<LogRequestMiddleware['use']>[0];
type LogResponse = Parameters<LogRequestMiddleware['use']>[1];

describe('LogRequestMiddleware', () => {
  const log = { http: jest.fn() };
  const middleware = new LogRequestMiddleware(log as unknown as LogsService);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [
      { ip: '192.0.2.10', httpVersion: '1.1', method: 'put' },
      '/updates/api?source=ui',
      '192.0.2.10|HTTP/1.1|PUT|/updates/api?source=ui',
    ],
    [
      { ip: '::1', httpVersion: '1.0', method: 'GET' },
      '/updates',
      '::1|HTTP/1.0|GET|/updates',
    ],
  ])(
    'logs the client IP, HTTP version, method and URL (%o %s)',
    (request, originalUrl, expected) => {
      // Frozen objects make any attempt to alter the request or response throw.
      const req = Object.freeze({ ...request, originalUrl }) as LogRequest;
      const res = Object.freeze({}) as LogResponse;
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(log.http.mock.calls).toEqual([[expected]]);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(log.http.mock.invocationCallOrder[0]).toBeLessThan(
        next.mock.invocationCallOrder[0],
      );
    },
  );
});
