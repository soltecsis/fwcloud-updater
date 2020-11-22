import { registerAs } from '@nestjs/config';

export default registerAs('updates', () => ({
  api: {
    versionURL: process.env.API_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-api',
    installDir: process.env.API_INSTALL_DIR || '/opt/fwcloud-api'
  },
  ui: {
    versionURL: process.env.UI_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-ui',
    installDir: process.env.UI_INSTALL_DIR || '/opt/fwcloud-ui'
  },
  updater: {
    versionURL: process.env.UPDATER_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-updater',
    installDir: process.env.UPDATER_INSTALL_DIR || '/opt/fwcloud-updater'
  }
}));