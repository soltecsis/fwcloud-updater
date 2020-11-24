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

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpdatesServiceConfig, Apps, Versions } from './updates.model';
import { LogsService } from 'src/logs/logs.service';
import * as cmp from 'semver-compare';
import * as fs from 'fs';
import * as branch from 'git-branch';
import * as cmd from 'node-cmd';
const axios = require('axios').default;

@Injectable()
export class UpdatesService {
  private _cfg: UpdatesServiceConfig;
  private log: LogsService;

  constructor (private configService: ConfigService, private logsService: LogsService) {
    this._cfg = <UpdatesServiceConfig>this.configService.get('updates');
    this.log = logsService;
  }

  async getVersions(app: Apps): Promise<Versions | null> {
    let localJson: any = {};
    let remoteJson: any = {};
    
    try {
      this.log.info(`Getting versions for fwcloud-${app}`);

      const localPath = `${this._cfg[app].installDir}/package.json`;
      fs.accessSync(localPath, fs.constants.R_OK);
      localJson = JSON.parse(fs.readFileSync(localPath, 'utf8'));

      const gitBranch = await branch(this._cfg[app].installDir);
      const remoteURL = `${this._cfg[app].versionURL}/${gitBranch}/package.json`;
      remoteJson = await axios.get(remoteURL);
    } catch (err) { 
      this.log.error('',err);
      return null;
    }

    if (!localJson || !localJson.version) {
      this.log.error('No local version');      
      return null;
    }

    if (!remoteJson || !remoteJson.data || !remoteJson.data.version) {
      this.log.error('No remote version');      
      return null;
    }

    const versions: Versions = {
      current: localJson.version,
      last: remoteJson.data.version,
      needsUpdate: cmp(remoteJson.data.version,localJson.version) === 1 ? true : false
    }

    return versions;
  }

  async runUpdate(app: Apps): Promise<void> {
    this.log.info(`Updating fwcloud-${app}`);

    // Make sure install dir exists.
    try { fs.lstatSync(this._cfg[app].installDir).isDirectory() }
    catch (err) { 
      this.log.error(`Directory not found: ${this._cfg[app].installDir}`);
      throw new HttpException(`fwcloud-${app} install directory not found`,HttpStatus.NOT_FOUND);
    }

    try { fs.readdirSync(this._cfg[app].installDir) }
    catch (err) { 
      this.log.error(`Accessing directory: ${this._cfg[app].installDir}`);
      throw new HttpException(`fwcloud-${app} install directory not accessible`,HttpStatus.NOT_FOUND);
    }

    const result: any = await cmd.runSync(`cd ${this._cfg[app].installDir} && npm run update`);
    if (result.err) {
      this.log.error(`${result.err}`);
      throw new HttpException('Error during the update procedure',HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return;
  }
}
