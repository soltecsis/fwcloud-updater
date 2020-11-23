import { HttpException, HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import * as fs from 'fs';

interface RequestWithCookies extends Request {
  cookies: string[];
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: RequestWithCookies, res: Response, next: Function) {
  try {
      if (!req.cookies)
      throw new Error('No cookies found');

      const cookie: string = req.cookies['FWCloud.net-cookie'];
      if (!cookie)
        throw new Error('No fwcloud cookie found');

      const split1: string[] = cookie.split(':');
      if (!split1 || split1.length!=2)
        throw new Error('Bad cookie data');
      
      const split2 = split1[1].split('.');
      if (!split2 || split2.length!=2)
        throw new Error('Bad cookie data');

      const sessionFile = `/Users/carles/Desktop/FWCloud.net/fwcloud-api/sessions/${split2[0]}.json`;
      fs.accessSync(sessionFile, fs.constants.R_OK);
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));

      if (session.cookie.maxAge < 1) // See if the session has expired.
        throw new Error('Session expired');

      if (!session.customer_id || !session.user_id || !session.username || !session.pgp || session.admin===undefined) 
        throw new Error('Bad session data');
      
      if (session.admin && session.admin===false)
        throw new Error('For updates you must be an user with admin role');
    } catch (err) { 
      //this.log.error('',err);
      throw new HttpException(err.message, HttpStatus.FORBIDDEN);
    }      

    next();
  }
}
