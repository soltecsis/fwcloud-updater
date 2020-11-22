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
