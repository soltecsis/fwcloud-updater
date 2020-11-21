import { registerAs } from '@nestjs/config';

export default registerAs('updates', () => ({
  apiVersionURL: process.env.API_VERSION_URL || 'https://raw.githubusercontent.com/soltecsis/fwcloud-api',
}));