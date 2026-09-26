import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    env: {
      TZ: "Asia/Baku",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      DIRECT_URL: "postgres://test:test@localhost:5432/test",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost",
      GOOGLE_TOKEN: '{"type":"authorized_user","client_id":"id","client_secret":"secret","refresh_token":"token"}',
      LOCALHOST_BASE_URL: "http://localhost:3000",
      RAILWAY_BASE_URL: "https://unibot.example.com",
      STICKER_BASE_URL: "https://sticker.example.com",
      OPENROUTER_API_KEY: "test-openrouter-key",
      ADOBE_CLIENT_ID: "test-adobe-id",
      ADOBE_CLIENT_SECRET: "test-adobe-secret",
      UNIBOT_PHONE_NUMBER: "994500000001@s.whatsapp.net",
      SUPER_ADMIN_PHONE_NUMBER: "994500000002@s.whatsapp.net",
      UNICHAT_GROUP_ID: "111111111111111111@g.us",
      INFORMATION_GROUP_ID: "222222222222222222@g.us",
      TEST_GROUP_ID: "333333333333333333@g.us",
      LOG_GROUP_ID: "444444444444444444@g.us",
      FINAL_EXAM_GROUP_ID: "555555555555555555@g.us",
    },
  },
});
