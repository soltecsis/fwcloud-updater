export type UpdatesServiceConfig = {
  api: {
    versionURL: string;
    installDir: string;
  },
  ui: {
    versionURL: string;
    installDir: string;
  },
  updater: {
    versionURL: string;
    installDir: string;
  }
}

export interface UpdatesInfo {
  api: Versions;
  ui: Versions;
  updater: Versions;
}

export interface Versions {
  current: string;
  last: string;
  needsUpdate: boolean;
}

export enum Apps {
  API = 'api',
  UI = 'ui',
  UPDATER = 'updater'
}
