import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Versions } from './updates.model'
const axios = require('axios').default;

type UpdatesServiceConfig = {
  apiVersionURL: string;
};

@Injectable()
export class UpdatesService {
  private _config: UpdatesServiceConfig;

  constructor (private configService: ConfigService) {
    this._config = <UpdatesServiceConfig>this.configService.get('updates');
  }

  UIVersions(): Versions {
    const versions: Versions = {
      current: "1.2.3",
      last: "2.2.2"
    }

    return versions;
  }

  async APIVersions(): Promise<Versions> {
    let doc: any = {};
    const gitBranch = "develop";
    
    try {
      doc = await axios.get(`${this._config.apiVersionURL}/${gitBranch}/package.json`);
    } catch (err) { throw new HttpException(`Getting last version URL: ${err.response.statusText}`, HttpStatus.INTERNAL_SERVER_ERROR); }

    if (!doc || !doc.data || !doc.data.version)
      throw new HttpException('Last version number not found', HttpStatus.NOT_FOUND);

    const versions: Versions = {
      current: "1.2.3",
      last: `${doc.data.version}`
    }

    return versions;
  }
}
