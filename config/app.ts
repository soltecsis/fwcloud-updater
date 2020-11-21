import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: process.env.LISTEN_PORT || 3031,
}));
