import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: { baseURL: "http://127.0.0.1:4173", headless: true },
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:4173/src/reader/",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "PORT=4174 npm run preview",
      url: "http://127.0.0.1:4174/macronic/prototype/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
