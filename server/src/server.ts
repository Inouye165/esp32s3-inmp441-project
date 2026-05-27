import { createApp } from './app';
import { config } from './config';
import { audioIngest } from './services/audioIngest';
import { audioIngestClassic } from './services/audioIngestClassic';

async function startServer() {
  await audioIngest.init();
  if (audioIngest.isEnabled()) {
    audioIngest.start();
  }

  if (audioIngestClassic.isEnabled()) {
    audioIngestClassic.start();
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`\n ESP32 INMP441 Streamer Dashboard`);
    console.log(` Server:     http://localhost:${config.port}`);
    console.log(` Unit 1 IP:  ${config.esp32.ip || '(set via POST /api/config)'}`);
    console.log(` Ingest 1:   ${audioIngest.isEnabled() ? `TCP :${config.ingest.port}` : 'disabled (STREAM_INGEST_ENABLED=true)'}`);
    console.log(` Ingest 2:   ${audioIngestClassic.isEnabled() ? `TCP :${config.ingest2.port}` : 'disabled (STREAM_INGEST2_ENABLED=true)'}\n`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});