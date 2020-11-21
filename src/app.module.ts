import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UpdatesModule } from './updates/updates.module';

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
    UpdatesModule],
})
export class AppModule {}
