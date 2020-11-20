import { Controller, Get, Put } from '@nestjs/common';
import { AppService, VersionsUpdate } from './app.service';

@Controller('updates')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('fwcloud-ui')
  getUIVersions(): VersionsUpdate {
    return this.appService.UIVersions();
  }

  @Put('fwcloud-ui')
  updateUI(): void {
    return;
  }

  @Get('fwcloud-api')
  async getAPIVersions(): Promise<VersionsUpdate> {
    return await this.appService.APIVersions();
  }

  @Put('fwcloud-api')
  updateAPI(): void {
    return;
  }

}
