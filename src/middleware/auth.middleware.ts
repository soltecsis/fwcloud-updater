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

import {
  HttpException,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { LogsService } from 'src/logs/logs.service';
import { UpdatesServiceConfig } from 'src/updates/updates.model';

interface RequestWithCookies extends Request {
  cookies: { [key: string]: string };
}

export type functionNext = () => void;

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private _cfg: UpdatesServiceConfig;

  constructor(
    private configService: ConfigService,
    private log: LogsService,
  ) {
    this._cfg = this.configService.get('updates');
  }

  use(req: RequestWithCookies, res: Response, next: functionNext): void {
    const cookieName = 'FWCloud.net-cookie';

    try {
      if (!req.cookies) throw new Error('No cookies found');

      const cookie: string = req.cookies[cookieName];
      if (!cookie) throw new Error(`Cookie ${cookieName} not found`);

      const split1: string[] = cookie.split(':');
      if (!split1 || split1.length != 2) throw new Error('Bad cookie data');

      const split2: string[] = split1[1].split('.');
      if (!split2 || split2.length != 2) throw new Error('Bad cookie data');

      const sessionFile: string = `${this._cfg.api.installDir}/sessions/${split2[0]}.json`;
      fs.accessSync(sessionFile, fs.constants.R_OK);
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as {
        cookie: { maxAge: number };
        customer_id: string;
        user_id: string;
        username: string;
        pgp: string;
        admin_role: boolean;
      };

      if (session.cookie.maxAge < 1)
        // See if the session has expired.
        throw new Error('Session expired');

      if (
        !session.customer_id ||
        !session.user_id ||
        !session.username ||
        !session.pgp ||
        session.admin_role === undefined
      )
        throw new Error('Bad session data');

      if (session.admin_role === false)
        throw new Error('For updates you must be an user with admin role');
    } catch (err: any) {
      this.log.error('Auth Middleware:', err as Error);
      throw new HttpException((err as Error).message, HttpStatus.FORBIDDEN);
    }

    next();
  }
}
