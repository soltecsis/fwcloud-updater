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
import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as child from 'child-process-promise';
import { exec } from 'child_process';
import * as path from 'path';

jest.mock('child-process-promise', () => ({
  spawn: jest.fn(),
}));

// Git branch resolution is controlled per test, so no real `git` process runs.
jest.mock('child_process', () => ({
  ...jest.requireActual<typeof import('child_process')>('child_process'),
  exec: jest.fn(),
}));

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

// Fixture paths derive from this file, not from the process working directory.
const TEST_DIR = path.resolve(__dirname, '../../test');
const DATA_DIR = path.join(TEST_DIR, 'DATA');

const createConfig = (): UpdatesServiceConfig => ({
  api: {
    versionURL: 'https://versions.invalid/fwcloud-api',
    installDir: path.join(DATA_DIR, 'NO_VERSION'),
  },
  ui: {
    versionURL: 'https://versions.invalid/fwcloud-ui',
    installDir: TEST_DIR,
  },
  updater: {
    versionURL: 'https://versions.invalid/fwcloud-updater',
    installDir: path.join(TEST_DIR, 'directory_not_exists'),
  },
  websrv: {
    versionURL: 'https://versions.invalid/fwcloud-websrv',
    installDir: DATA_DIR,
  },
});

describe('UpdatesService', () => {
  let service: UpdatesService;
  let cfg: UpdatesServiceConfig;
  let axiosGetSpy: jest.SpiedFunction<typeof axios.get>;
  let childSpawnMock: jest.Mock;
  const execMock = exec as unknown as jest.Mock<
    void,
    [string, { cwd: string }, ExecCallback]
  >;

  const mockLogsService: { info: jest.Mock; error: jest.Mock } = {
    info: jest.fn(),
    error: jest.fn(),
  };

  const createSpawnResult = () => {
    const promise = Promise.resolve({}) as Promise<unknown> & {
      childProcess: { unref: jest.Mock };
    };
    promise.childProcess = { unref: jest.fn() };
    return promise;
  };

  const mockGitBranch = (branch: string) =>
    execMock.mockImplementation((_command, _options, callback) =>
      callback(null, `${branch}\n`, ''),
    );

  const createService = async (
    config: Partial<UpdatesServiceConfig>,
  ): Promise<UpdatesService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdatesService,
        { provide: ConfigService, useValue: { get: () => config } },
        { provide: LogsService, useValue: mockLogsService },
      ],
    }).compile();

    return module.get<UpdatesService>(UpdatesService);
  };

  beforeEach(async () => {
    cfg = createConfig();
    service = await createService(cfg);

    mockGitBranch('main');
    axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({});
    childSpawnMock = child.spawn as jest.Mock;
    childSpawnMock.mockImplementation(() => createSpawnResult());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGitBranch', () => {
    it('resolves the trimmed branch of the given directory', async () => {
      mockGitBranch('ENS');

      await expect(service.getGitBranch(DATA_DIR)).resolves.toBe('ENS');
      expect(execMock).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: DATA_DIR },
        expect.any(Function),
      );
    });

    it('rejects with the Git error output', async () => {
      execMock.mockImplementation((_command, _options, callback) =>
        callback(new Error('exit code 128'), '', 'not a git repository'),
      );

      await expect(service.getGitBranch(DATA_DIR)).rejects.toThrow(
        'Error getting git branch: not a git repository',
      );
    });
  });

  describe('compareVersions', () => {
    it('error accesing package.json file (no such directory)', async () => {
      expect(await service.compareVersions(Apps.UPDATER)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][1].message).toEqual(
        `ENOENT: no such file or directory, access '${cfg.updater.installDir}/package.json'`,
      );
      expect(execMock).not.toHaveBeenCalled();
      expect(axiosGetSpy).not.toHaveBeenCalled();
    });

    it('error accesing package.json file (no such file)', async () => {
      expect(await service.compareVersions(Apps.UI)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][1].message).toEqual(
        `ENOENT: no such file or directory, access '${cfg.ui.installDir}/package.json'`,
      );
    });

    it('error due to package.json file without version data', async () => {
      expect(await service.compareVersions(Apps.API)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][0]).toEqual(
        'No local version found updating fwcloud-api',
      );
    });

    it('error resolving the Git branch of the install directory', async () => {
      execMock.mockImplementation((_command, _options, callback) =>
        callback(new Error('exit code 128'), '', 'not a git repository'),
      );

      expect(await service.compareVersions(Apps.WEBSRV)).toBeNull();
      expect(axiosGetSpy).not.toHaveBeenCalled();
      expect(mockLogsService.error).toHaveBeenCalledWith(
        "Accessing url '':",
        expect.objectContaining({
          message: 'Error getting git branch: not a git repository',
        }),
      );
    });

    it('error requesting the remote package.json file', async () => {
      axiosGetSpy.mockRejectedValue(new Error('network unavailable'));

      expect(await service.compareVersions(Apps.WEBSRV)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalledWith(
        `Accessing url '${cfg.websrv.versionURL}/main/package.json':`,
        expect.objectContaining({ message: 'network unavailable' }),
      );
    });

    it('no remote version', async () => {
      expect(await service.compareVersions(Apps.WEBSRV)).toBeNull();
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][0]).toEqual(
        'No remote version found updating fwcloud-websrv',
      );
    });

    it('requests the remote version of the installed branch', async () => {
      mockGitBranch('ENS');
      axiosGetSpy.mockResolvedValue({ data: { version: '1.1.1' } });

      await service.compareVersions(Apps.WEBSRV);

      expect(execMock).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        { cwd: cfg.websrv.installDir },
        expect.any(Function),
      );
      expect(axiosGetSpy).toHaveBeenCalledWith(
        `${cfg.websrv.versionURL}/ENS/package.json`,
      );
    });

    it('should update', async () => {
      axiosGetSpy.mockResolvedValue({ data: { version: '1.1.1' } });
      expect(await service.compareVersions(Apps.WEBSRV)).toEqual({
        current: '1.0.7',
        last: '1.1.1',
        needsUpdate: true,
      });
    });

    it('should not update (same version)', async () => {
      axiosGetSpy.mockResolvedValue({ data: { version: '1.0.7' } });
      expect(await service.compareVersions(Apps.WEBSRV)).toEqual({
        current: '1.0.7',
        last: '1.0.7',
        needsUpdate: false,
      });
    });

    it('should not update (last less than current)', async () => {
      axiosGetSpy.mockResolvedValue({ data: { version: '1.0.0' } });
      expect(await service.compareVersions(Apps.WEBSRV)).toEqual({
        current: '1.0.7',
        last: '1.0.0',
        needsUpdate: false,
      });
    });
  });

  describe('runUpdate', () => {
    it('error directory not found', async () => {
      await expect(service.runUpdate(Apps.UPDATER)).rejects.toThrow(
        'fwcloud-updater install directory not found',
      );
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][1].message).toEqual(
        `ENOENT: no such file or directory, lstat '${cfg.updater.installDir}'`,
      );
      expect(childSpawnMock).not.toHaveBeenCalled();
    });

    it('should launch fwcloud-ui update', async () => {
      await expect(service.runUpdate(Apps.UI)).resolves.toBeUndefined();
      expect(childSpawnMock.mock.calls).toEqual([
        ['npm', ['run', 'update'], { cwd: cfg[Apps.UI].installDir }],
      ]);
    });

    it('error during fwcloud-ui update', async () => {
      childSpawnMock.mockRejectedValue(new Error('npm failed'));

      const error = await service
        .runUpdate(Apps.UI)
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.METHOD_NOT_ALLOWED,
      );
      expect((error as HttpException).message).toBe(
        'Error during fwcloud-ui update procedure',
      );
      expect(mockLogsService.error).toHaveBeenCalledWith(
        'Error during fwcloud-ui update procedure: npm failed',
      );
    });

    it.each([Apps.WEBSRV, Apps.API])(
      'should launch fwcloud-%s update in the background',
      async (app) => {
        jest.useFakeTimers();

        await expect(service.runUpdate(app)).resolves.toBeUndefined();
        expect(childSpawnMock).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1000);

        expect(childSpawnMock.mock.calls).toEqual([
          ['npm', ['run', 'update'], { cwd: cfg[app].installDir }],
          [
            'npm',
            ['run', 'start:bg'],
            { cwd: cfg[app].installDir, detached: true, stdio: 'ignore' },
          ],
        ]);
        const startResult = childSpawnMock.mock.results[1].value as {
          childProcess: { unref: jest.Mock };
        };
        expect(startResult.childProcess.unref).toHaveBeenCalled();
      },
    );

    it('logs background update errors without restarting the app', async () => {
      jest.useFakeTimers();
      childSpawnMock.mockRejectedValueOnce(new Error('npm failed'));

      await expect(service.runUpdate(Apps.API)).resolves.toBeUndefined();
      await jest.advanceTimersByTimeAsync(1000);

      expect(childSpawnMock).toHaveBeenCalledTimes(1);
      expect(mockLogsService.error).toHaveBeenCalledWith(
        'Error during fwcloud-api update procedure: npm failed',
      );
    });

    it('should not launch fwcloud-updater update', async () => {
      service = await createService({
        updater: {
          versionURL: '',
          installDir: TEST_DIR,
        },
      });

      await expect(service.runUpdate(Apps.UPDATER)).rejects.toThrow(
        'Error fwcloud-updater con only update fwcloud-websrv, fwcloud-api and fwcloud-ui',
      );
      expect(mockLogsService.error).toHaveBeenCalled();
      expect(mockLogsService.error.mock.calls[0][0]).toEqual(
        'Error fwcloud-updater con only update fwcloud-websrv, fwcloud-api and fwcloud-ui',
      );
      expect(childSpawnMock).not.toHaveBeenCalled();
    });
  });
});
