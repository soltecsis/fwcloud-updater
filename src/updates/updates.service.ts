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
const spawn = require('child-process-promise').spawn;
const axios = require('axios').default;

@Injectable()
export class UpdatesService {
  private _cfg: UpdatesServiceConfig;
  private log: LogsService;

  constructor (private configService: ConfigService, private logsService: LogsService) {
    this._cfg = <UpdatesServiceConfig>this.configService.get('updates');
    this.log = logsService;
  }

  async compareVersions(app: Apps): Promise<Versions | null> {
    let localJson: any = {};
    let remoteJson: any = {};

    const localPath = `${this._cfg[app].installDir}/package.json`;
    try {
      fs.accessSync(localPath, fs.constants.R_OK);
      localJson = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    } catch(err) {
      this.log.error(`Accessing file '${localPath}' :`,err);
      return null;      
    }

    let remoteURL = '';
    try {
      const gitBranch = await branch(this._cfg[app].installDir);
      remoteURL = `${this._cfg[app].versionURL}/${gitBranch}/package.json`;
      remoteJson = await axios.get(remoteURL);
    } catch (err) { 
      this.log.error(`Accessing url '${remoteURL}':`,err);
      return null;
    }

    if (!localJson || !localJson.version) {
      this.log.error(`No local version found updating fwcloud-{$app}`);      
      return null;
    }

    if (!remoteJson || !remoteJson.data || !remoteJson.data.version) {
      this.log.error(`No remote version found updating fwcloud-{$app}`);      
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
    // Make sure install dir exists.
    try { fs.lstatSync(this._cfg[app].installDir).isDirectory() }
    catch (err) { 
      this.log.error(`Directory not found: ${this._cfg[app].installDir}`,err);
      throw new HttpException(`fwcloud-${app} install directory not found`,HttpStatus.NOT_FOUND);
    }

    try { fs.readdirSync(this._cfg[app].installDir) }
    catch (err) { 
      this.log.error(`Accessing directory: ${this._cfg[app].installDir}`,err);
      throw new HttpException(`fwcloud-${app} install directory not accessible`,HttpStatus.NOT_FOUND);
    }

    if (app === Apps.UI) {
      try { 
        await spawn('npm', ['run', 'update'], { cwd: this._cfg[app].installDir, shell: true, detached: true });
      }
      catch(err) {
        this.log.error(`Error during fwcloud-${app} update procedure: ${err.message}`);
        throw new HttpException(`Error during fwcloud-${app} update procedure`,HttpStatus.METHOD_NOT_ALLOWED);
      }
    }
    else if (app === Apps.API || app === Apps.WEBSRV) { // For fwcloud-api and fwcloud-websrv update don't wait, answer immediately and run update in background.
      setTimeout(async () => {
        try { await spawn('npm', ['run', 'update'], { cwd: this._cfg[app].installDir, shell: true, detached: true }) }
        catch(err) { this.log.error(`Error during fwcloud-${app} update procedure: ${err.message}`);}
      }, 2000);
    }
    else {
      this.log.error('Error fwcloud-updater con only update fwcloud-websrv, fwcloud-api and fwcloud-ui');
      throw new HttpException('Error fwcloud-updater con only update fwcloud-websrv, fwcloud-api and fwcloud-ui',HttpStatus.FORBIDDEN);
    }

    return;
  }
}
