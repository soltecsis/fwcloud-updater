import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as winston from 'winston';

@Injectable()
export class LogsService {
  private _logger: winston.Logger;

  constructor() {
    // Make sure logs directory exists.
    if (!fs.existsSync('logs')){
      fs.mkdirSync('logs');
    }

    this._logger = winston.createLogger({
      level: 'debug',
      levels: winston.config.npm.levels,
      format: winston.format.combine (
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf((info) => `${info.timestamp}|${info.level.toUpperCase()}|${info.message}`)
      ),
      defaultMeta: { service: 'user-service' },
      transports: [
        new winston.transports.File({ filename: 'logs/updater.log', maxsize: 10240, maxFiles: 7, tailable: true }),
      ],
    });
  }

  info(log: string, meta?: any):void {
    this._logger.info(log, meta);
  }

  error(log: string, meta?: any):void {
    this._logger.error(log, meta);
  }
}
