import { Controller, Get, Put } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { Versions } from './updates.model';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get('fwcloud-ui')
  getUIVersions(): Versions {
    return this.updatesService.UIVersions();
  }

  @Put('fwcloud-ui')
  updateUI(): void {
    return;
  }

  @Get('fwcloud-api')
  async getAPIVersions(): Promise<Versions> {
    return await this.updatesService.APIVersions();
  }

  @Put('fwcloud-api')
  updateAPI(): void {
    return;
  }
}
