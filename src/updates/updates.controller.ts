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

import { Controller, Get, Put, Req } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { Apps, UpdatesInfo } from './updates.model';
import { Request } from 'express';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Get()
  async getUpdatesInfo(@Req() request: Request): Promise<UpdatesInfo> {
    const updatesInfo: UpdatesInfo = {
      api: await this.updatesService.getVersions(Apps.API),
      ui: await this.updatesService.getVersions(Apps.UI),
      updater: await this.updatesService.getVersions(Apps.UPDATER)
    }

    return updatesInfo;
  }

  @Put('ui')
  async updateUI(): Promise<void> {
    return this.updatesService.runUpdate(Apps.UI);
  }

  @Put('api')
  async updateAPI(): Promise<void> {
    return this.updatesService.runUpdate(Apps.API);
  }
}
