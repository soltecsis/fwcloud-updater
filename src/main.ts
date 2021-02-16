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

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { LogsService } from './logs/logs.service';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';

async function bootstrap() {
  let app = await NestFactory.create(AppModule);
  let config: ConfigService = app.get<ConfigService>(ConfigService);

  if (config.get('updater.https')) {
    const httpsOptions = {
      key: fs.readFileSync(config.get('updater.key')).toString(),
      cert: fs.readFileSync(config.get('updater.cert')).toString(),
      ca: config.get('updater.ca_bundle') ? fs.readFileSync(config.get('updater.ca_bundle')).toString() : null
    }
    app.close();
    app = await NestFactory.create(AppModule,{httpsOptions: httpsOptions});
    config = app.get<ConfigService>(ConfigService);
  }


  const log: LogsService = app.get<LogsService>(LogsService);
  const host: string = config.get('updater.host');
  const port: number = config.get('updater.port');

  app.use(cookieParser());

  log.info(`------- Starting application -------`);
  log.info(`FWCloud Updater v${JSON.parse(fs.readFileSync('package.json').toString()).version} (PID=${process.pid})`);

  await app.listen(port,host);
  log.info(`Listening on http${config.get('updater.host') ? 's' : ''}://${host}:${port}`);

  fs.writeFileSync('.pid',`${process.pid}`);

  function signalHandler (signal: 'SIGINT' | 'SIGTERM') {
    log.info(`Received signal: ${signal}`);
    fs.unlink('.pid',err => {
      log.info(`------- Application stopped --------`);
      app.close();
      setTimeout(() => process.exit(0), 100);
    });
  }
  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
}
bootstrap();
