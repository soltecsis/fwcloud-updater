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

import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UpdatesController } from './updates.controller';
import { Apps, Versions } from './updates.model';
import { UpdatesService } from './updates.service';

describe('UpdatesController', () => {
  let controller: UpdatesController;
  const updatesService = {
    compareVersions: jest.fn<Promise<Versions | null>, [Apps]>(),
    runUpdate: jest.fn<Promise<void>, [Apps]>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UpdatesController],
      providers: [{ provide: UpdatesService, useValue: updatesService }],
    }).compile();

    controller = module.get<UpdatesController>(UpdatesController);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUpdatesInfo', () => {
    it('returns the version comparison of every FWCloud component', async () => {
      const versions: Record<Apps, Versions | null> = {
        [Apps.WEBSRV]: { current: '2.0.0', last: '2.1.0', needsUpdate: true },
        [Apps.UI]: { current: '2.1.0', last: '2.1.0', needsUpdate: false },
        [Apps.API]: null,
        [Apps.UPDATER]: { current: '2.0.5', last: '2.0.5', needsUpdate: false },
      };
      updatesService.compareVersions.mockImplementation((app) =>
        Promise.resolve(versions[app]),
      );

      await expect(controller.getUpdatesInfo()).resolves.toEqual({
        websrv: versions[Apps.WEBSRV],
        ui: versions[Apps.UI],
        api: null,
        updater: versions[Apps.UPDATER],
      });
      expect(updatesService.compareVersions.mock.calls).toEqual([
        [Apps.WEBSRV],
        [Apps.UI],
        [Apps.API],
        [Apps.UPDATER],
      ]);
      expect(updatesService.runUpdate).not.toHaveBeenCalled();
    });

    it('propagates version lookup errors', async () => {
      updatesService.compareVersions.mockRejectedValue(new Error('failure'));

      await expect(controller.getUpdatesInfo()).rejects.toThrow('failure');
    });
  });

  describe.each([
    ['updateUI', Apps.UI, (c: UpdatesController) => c.updateUI()],
    ['updateAPI', Apps.API, (c: UpdatesController) => c.updateAPI()],
    ['updateWebsrv', Apps.WEBSRV, (c: UpdatesController) => c.updateWebsrv()],
  ])('%s', (_name, app, update) => {
    it(`runs the fwcloud-${app} update`, async () => {
      updatesService.runUpdate.mockResolvedValue(undefined);

      await expect(update(controller)).resolves.toBeUndefined();
      expect(updatesService.runUpdate.mock.calls).toEqual([[app]]);
      expect(updatesService.compareVersions).not.toHaveBeenCalled();
    });

    it('propagates update errors', async () => {
      const error = new HttpException('not found', HttpStatus.NOT_FOUND);
      updatesService.runUpdate.mockRejectedValue(error);

      await expect(update(controller)).rejects.toBe(error);
    });
  });
});
