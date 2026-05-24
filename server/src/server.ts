import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, () => {
  console.log(`\n ESP32-S3 INMP441 Dashboard`);
  console.log(` Server:    http://localhost:${config.port}`);
  console.log(` ESP32 IP:  ${config.esp32.ip || '(not set — configure via POST /api/config)'}\n`);
});
