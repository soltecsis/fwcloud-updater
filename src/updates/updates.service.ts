import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Apps, Versions } from './updates.model';
const axios = require('axios').default;
import * as cmp from 'semver-compare';
import * as fs from 'fs';

type UpdatesServiceConfig = {
  api: {
    versionURL: string;
    installDir: string;
  }
};

@Injectable()
export class UpdatesService {
  private _config: UpdatesServiceConfig;

  constructor (private configService: ConfigService) {
    this._config = <UpdatesServiceConfig>this.configService.get('updates');
  }

  async getVersions(app: Apps): Promise<Versions | null> {
    const localPath = `${this._config[app].installDir}/package.json`;
    let localJson: any = {};

    // Code for obtain local install git branch.
    const gitBranch = "develop";

    const remoteURL = `${this._config[app].versionURL}/${gitBranch}/package.json`;
    let remoteJson: any = {};
    
    try {
      fs.accessSync(localPath, fs.constants.R_OK);
      localJson = JSON.parse(fs.readFileSync(localPath, 'utf8'));

      remoteJson = await axios.get(remoteURL);
    } catch (err) { 
      // Log error.
      //throw new HttpException(`Getting last version URL: ${err.response.statusText}`, HttpStatus.INTERNAL_SERVER_ERROR); 
      return null;
    }

    if (!localJson || !localJson.version) {
      // Log error.
      //throw new HttpException('Last version number not found', HttpStatus.NOT_FOUND);
      return null;
    }

    if (!remoteJson || !remoteJson.data || !remoteJson.data.version) {
      // Log error.
      //throw new HttpException('Last version number not found', HttpStatus.NOT_FOUND);
      return null;
    }

    const versions: Versions = {
      current: localJson.version,
      last: remoteJson.data.version,
      needsUpdate: cmp(remoteJson.data.version,localJson.version) === 1 ? true : false
    }

    return versions;
  }
}
