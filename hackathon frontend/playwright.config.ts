import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: {timeout: 10000},
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: process.env.E2E_BROWSER || undefined,
    headless: true,
    permissions:['microphone'],
    launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: {width:1280,height:900},
  },
  webServer: [
    {
      command: `${process.env.E2E_PYTHON || 'python'} -m tests.browser_server`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8011/api/v1/health/ready',
      timeout:60000,
      reuseExistingServer:process.env.E2E_REUSE_SERVERS === 'true',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url:'http://127.0.0.1:5174',
      env:{VITE_USE_MOCK:'false',VITE_API_BASE_URL:'http://127.0.0.1:8011'},
      reuseExistingServer:process.env.E2E_REUSE_SERVERS === 'true',
    },
  ],
});
