import { defineConfig } from 'vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [
    devvit({
      client: {
        build: {
          chunkSizeWarningLimit: 2000,
          // Every file under dist/client is uploaded to Reddit. Sourcemaps added
          // ~11MB of payload for zero player benefit, so don't emit them.
          sourcemap: false,
        },
      },
      server: {
        build: {
          sourcemap: false,
        },
      },
    }),
  ],
});
