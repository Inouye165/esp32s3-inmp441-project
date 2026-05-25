import { createApp } from './app';
import { config } from './config';
import { archiveRecorder } from './services/archiveRecorder';

async function startServer() {
  await archiveRecorder.init();
  if (config.archive.autoStart) {
    archiveRecorder.start();
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`\n ESP32-S3 INMP441 Dashboard`);
    console.log(` Server:       http://localhost:${config.port}`);
    console.log(` ESP32 IP:     ${config.esp32.ip || '(not set — configure via POST /api/config)'}`);
    console.log(` Archive dir:  ${config.archive.recordingsDir}`);
    console.log(` Archive chunk ${config.archive.chunkMs} ms\n`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
