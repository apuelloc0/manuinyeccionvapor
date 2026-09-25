import 'dotenv/config';
import app from './app.js';
import { startScheduler } from './services/scheduler.js';
import { startTelegram } from './services/telegramBot.js';

const PORT = process.env.PORT || 4000;

const init = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Servidor de SteamTrack corriendo en http://localhost:${PORT}`);
      startScheduler();
      startTelegram();
    });
  } catch (error) {
    console.error('❌ Error iniciando el sistema:', error);
  }
};

init();
