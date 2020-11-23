import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UpdatesModule } from './updates/updates.module';
import { LogsModule } from './logs/logs.module';

import appConfig from '../config/app';
import updatesConfig from '../config/updates';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        updatesConfig
      ],
    }),
    UpdatesModule,
    LogsModule],
})
export class AppModule {}
