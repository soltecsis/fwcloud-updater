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

export default registerAs('updater', () => ({
  host: process.env.LISTEN_HOST || '127.0.0.1',
  port: process.env.LISTEN_PORT || 3132,

  // Enable HTTPS protocol for the web server.
  https: process.env.HTTPS_ENABLED === 'false' ? false : true,

  // Path to certificate file for the web server.
  cert: process.env.HTTPS_CERT || './config/tls/fwcloud-updater.crt',

  // Path to key file for the web server.
  key: process.env.HTTPS_KEY || './config/tls/fwcloud-updater.key',

  // Path to CA bundle file for the web server.
  ca_bundle: process.env.HTTPS_CA_BUNDLE || ''
}));
