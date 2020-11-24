import { HttpException, HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { LogsService } from 'src/logs/logs.service';
import { UpdatesServiceConfig } from 'src/updates/updates.model';

interface RequestWithCookies extends Request {
  cookies: string[];
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private _cfg: UpdatesServiceConfig;
  private log: LogsService;

  constructor (private configService: ConfigService, private logsService: LogsService) {
    this._cfg = <UpdatesServiceConfig>this.configService.get('updates');
    this.log = logsService;
  }

  use(req: RequestWithCookies, res: Response, next: Function) {
    const cookieName = 'FWCloud.net-cookie';

    try {
      if (!req.cookies)
      throw new Error('No cookies found');

      const cookie: string = req.cookies[cookieName];
      if (!cookie)
        throw new Error(`Cookie ${cookieName} not found`);

      const split1: string[] = cookie.split(':');
      if (!split1 || split1.length!=2)
        throw new Error('Bad cookie data');
      
      const split2 = split1[1].split('.');
      if (!split2 || split2.length!=2)
        throw new Error('Bad cookie data');

      const sessionFile = `${this._cfg.api.installDir}/sessions/${split2[0]}.json`;
      fs.accessSync(sessionFile, fs.constants.R_OK);
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

      if (session.cookie.maxAge < 1) // See if the session has expired.
        throw new Error('Session expired');

      if (!session.customer_id || !session.user_id || !session.username || !session.pgp || session.admin_role===undefined) 
        throw new Error('Bad session data');
      
      if (session.admin_role && session.admin_role===false)
        throw new Error('For updates you must be an user with admin role');
    } catch (err) { 
      this.log.error('Auth Middleware:',err);
      throw new HttpException(err.message, HttpStatus.FORBIDDEN);
    }      

    next();
  }
}
