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

import { Test, TestingModule } from '@nestjs/testing';
import { UpdatesService } from './updates.service';
import { UpdatesServiceConfig, Apps } from './updates.model';
import { LogsService } from '../logs/logs.service';
import { ConfigService } from '@nestjs/config';
const axios = require('axios').default;
const child = require('child-process-promise');

describe('UpdatesService', () => {
  let service: UpdatesService;
  let configService: ConfigService;
  let cfg:UpdatesServiceConfig;

  const mockLogsService = {
    info: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UpdatesService,
        {
        provide: ConfigService,
        useValue: {
          get: (): UpdatesServiceConfig => {
              return {
                api: {
                  versionURL: '',
                  installDir: './test/DATA/NO_VERSION'
                },
                ui: {
                  versionURL: '',
                  installDir: './test'
                },
                updater: {
                  versionURL:'',
                  installDir:'./test/directory_not_exists'
                },
                websrv: {
                  versionURL: '',
                  installDir: './test/DATA'
                }
              };
            },
          },
        },
        { provide: LogsService, useValue: mockLogsService },],
    }).compile();

    service = module.get<UpdatesService>(UpdatesService);
    cfg = <UpdatesServiceConfig>module.get<ConfigService>(ConfigService).get('updates');

    axios.get = jest.fn().mockResolvedValue({});
    child.spawn = jest.fn().mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('compareVersions', () => {
    it('error accesing package.json file (no such directory)', async () => {
      expect(await service.compareVersions(Apps.UPDATER)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][1].message).toEqual(
        "ENOENT: no such file or directory, access './test/directory_not_exists/package.json'",
      );
    });

    it('error accesing package.json file (no such file)', async () => {
      expect(await service.compareVersions(Apps.UI)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][1].message).toEqual(
        "ENOENT: no such file or directory, access './test/package.json'",
      );
    });

    it('error due to package.json file without version data', async () => {
      expect(await service.compareVersions(Apps.API)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][0]).toEqual(
        "No local version found updating fwcloud-api",
      );
    });

    it('no remote version', async () => {
      expect(await service.compareVersions(Apps.WEBSRV)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][0]).toEqual(
        "No remote version found updating fwcloud-websrv",
      );
    });

    it('should update', async () => {
      axios.get = jest.fn().mockResolvedValue({ data: { version: "1.1.1" } });
      expect(await service.compareVersions(Apps.WEBSRV)).toEqual({"current": "1.0.7", "last": "1.1.1", "needsUpdate": true});
    });

    it('should not update (same version)', async () => {
      axios.get = jest.fn().mockResolvedValue({ data: { version: "1.0.7" } });
      expect(await service.compareVersions(Apps.WEBSRV)).toEqual({"current": "1.0.7", "last": "1.0.7", "needsUpdate": false});
    });

    it('should not update (last less than current)', async () => {
      axios.get = jest.fn().mockResolvedValue({ data: { version: "1.0.0" } });
      expect(await service.compareVersions(Apps.WEBSRV)).toEqual({"current": "1.0.7", "last": "1.0.0", "needsUpdate": false});
    });
  });


  describe('runUpdate', () => {
    it('error directory not found', async () => {
      await expect(service.runUpdate(Apps.UPDATER)).rejects.toThrow(
        'fwcloud-updater install directory not found',
      );
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][1].message).toEqual(
        "ENOENT: no such file or directory, lstat './test/directory_not_exists'",
      );
    });

    it('should launch fwcloud-ui update', async () => {
      expect(await service.runUpdate(Apps.UI)).resolves;
      expect(child.spawn).toHaveBeenCalled();
      expect(child.spawn.mock.calls[0]).toEqual(['npm',['run','update'], { cwd: cfg[Apps.UI].installDir }]);
    });

    it('should launch fwcloud-websrv update', async () => {
      expect(await service.runUpdate(Apps.WEBSRV)).resolves;
      await new Promise((resolve) => { 
        setTimeout(() => {
          expect(child.spawn).toHaveBeenCalled();
          expect(child.spawn.mock.calls[0]).toEqual(['npm',['run','update'], { cwd: cfg[Apps.WEBSRV].installDir }]); 
          expect(child.spawn.mock.calls[1]).toEqual(['npm',['run','start:bg'], { cwd: cfg[Apps.WEBSRV].installDir, detached: true, stdio: 'ignore' }]); 
          resolve({}); 
        },1100);
      });
    });

    it('should launch fwcloud-api update', async () => {
      expect(await service.runUpdate(Apps.API)).resolves;
      await new Promise((resolve) => { 
        setTimeout(() => {
          expect(child.spawn).toHaveBeenCalled();
          expect(child.spawn.mock.calls[0]).toEqual(['npm',['run','update'], { cwd: cfg[Apps.API].installDir }]); 
          expect(child.spawn.mock.calls[1]).toEqual(['npm',['run','start:bg'], { cwd: cfg[Apps.API].installDir, detached: true, stdio: 'ignore' }]); 
          resolve({}); 
        },1100);
      });
    });

    it('should not launch fwcloud-updater update', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [UpdatesService,
          {
          provide: ConfigService,
          useValue: {
            get: () => {
                return {
                  updater: {
                    versionURL:'',
                    installDir:'./test'
                  }
                };
              },
            },
          },
          { provide: LogsService, useValue: mockLogsService },],
      }).compile();
  
      service = module.get<UpdatesService>(UpdatesService);

      await expect(service.runUpdate(Apps.UPDATER)).rejects.toThrow(
        'Error fwcloud-updater con only update fwcloud-websrv, fwcloud-api and fwcloud-ui',
      );
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][0]).toEqual(
        'Error fwcloud-updater con only update fwcloud-websrv, fwcloud-api and fwcloud-ui',
      );
    });

  });

});
