import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'robots.txt',
        'apple-touch-icon.png',
        'browserconfig.xml',
        'mstile-150x150.png',
        'splashscreens/ipad_splash.png',
        'splashscreens/ipadpro1_splash.png',
        'splashscreens/ipadpro2_splash.png',
        'splashscreens/iphone5_splash.png',
        'splashscreens/iphone6_splash.png',
        'splashscreens/iphoneplus_splash.png',
        'splashscreens/iphonex_splash.png',
      ],
      manifest: {
        short_name: 'Onnikka',
        name: 'Onnikka',
        icons: [
          {
            src: '/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon.svg',
            type: 'image/svg+xml',
          },
        ],
        start_url: './index.html',
        display: 'fullscreen',
        theme_color: '#0079c2',
        background_color: '#0079c2',
      },
    }),
  ],
  server: {
    proxy: {
      '/buses': 'https://onnikka.net/',
    },
  },
});
