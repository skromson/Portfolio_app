import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
