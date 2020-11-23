import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UpdatesModule } from './updates/updates.module';
import { LogsModule } from './logs/logs.module';

import appConfig from '../config/app';
import updatesConfig from '../config/updates';
import { AuthMiddleware } from './middleware/auth.middleware';

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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
