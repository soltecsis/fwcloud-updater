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

import { registerAs } from '@nestjs/config';

export default registerAs('updates', () => ({
  api: {
    versionURL: process.env.API_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-api',
    installDir: process.env.API_INSTALL_DIR || '/opt/fwcloud/api'
  },
  ui: {
    versionURL: process.env.UI_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-ui',
    installDir: process.env.UI_INSTALL_DIR || '/opt/fwcloud/ui'
  },
  updater: {
    versionURL: process.env.UPDATER_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-updater',
    installDir: process.env.UPDATER_INSTALL_DIR || '/opt/fwcloud/updater'
  },
  websrv: {
    versionURL: process.env.WEBSRV_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-websrv',
    installDir: process.env.WEBSRV_INSTALL_DIR || '/opt/fwcloud/websrv'
  }
}));