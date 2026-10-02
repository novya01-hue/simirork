import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yoski.simirork',
  appName: 'SimiRork',
  webDir: 'public',
  server: {
    url: 'https://simirork.vercel.app',
    cleartext: false
  }
};

export default config;