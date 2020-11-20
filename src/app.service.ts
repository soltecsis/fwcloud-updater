import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
const axios = require('axios').default;

export interface VersionsUpdate {
  current: string,
  last: string
}

@Injectable()
export class AppService {
  UIVersions(): VersionsUpdate {
    const versions: VersionsUpdate = {
      current: "1.2.3",
      last: "2.2.2"
    }

    return versions;
  }

  async APIVersions(): Promise<VersionsUpdate> {
    let doc: any = {};
    const gitBranch = "develop";
    
    try {
      doc = await axios.get(`https://raw.githubusercontent.com/soltecsis/fwcloud-api/${gitBranch}/package.json`);
    } catch (err) { throw new HttpException(`Getting last version URL: ${err.response.statusText}`, HttpStatus.INTERNAL_SERVER_ERROR); }

    if (!doc || !doc.data || !doc.data.version)
      throw new HttpException('Last version number not found', HttpStatus.NOT_FOUND);

    const versions: VersionsUpdate = {
      current: "1.2.3",
      last: `${doc.data.version}`
    }

    return versions;
  }
}
