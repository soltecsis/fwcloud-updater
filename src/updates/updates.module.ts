import { Module } from '@nestjs/common';
import { LogsModule } from 'src/logs/logs.module';
import { UpdatesController } from './updates.controller';
import { UpdatesService } from './updates.service';

@Module({
  controllers: [UpdatesController],
  providers: [UpdatesService],
  imports: [LogsModule]
})
export class UpdatesModule {}
