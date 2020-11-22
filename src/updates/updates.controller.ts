import { Controller, Get, Put } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { Apps, UpdatesInfo } from './updates.model';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get()
  async getUpdatesInfo(): Promise<UpdatesInfo> {
    const updatesInfo: UpdatesInfo = {
      api: await this.updatesService.getVersions(Apps.API),
      ui: await this.updatesService.getVersions(Apps.UI),
      updater: await this.updatesService.getVersions(Apps.UPDATER)
    }

    return updatesInfo;
  }

  @Put('fwcloud-ui')
  updateUI(): void {
    return;
  }

  @Put('fwcloud-api')
  updateAPI(): void {
    return;
  }
}