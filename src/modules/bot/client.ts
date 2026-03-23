import { Client, LocalAuth } from "whatsapp-web.js";

declare global {
  var _clientInstance: Client | undefined;
}

let client: Client;

const args = new Set([
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--disable-notifications",
  "--disable-extensions",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--disable-infobars",
  "--disable-breakpad",
  "--disable-features=site-per-process",
  "--disable-popup-blocking",
  "--disable-sync",
  "--disable-translate",
  "--mute-audio",
  "--disable-default-apps",
  "--autoplay-policy=user-gesture-required",
  "--disable-setuid-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--disable-features=IsolateOrigins,site-per-process",
  "--disable-features=VizDisplayCompositor",
  "--no-zygote",
  "--renderer-process-limit=1",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-domain-reliability",
  "--disable-extensions",
  "--disable-hang-monitor",
  "--disable-ipc-flooding-protection",
  "--disable-notifications",
  "--disable-offer-store-unmasked-wallet-cards",
  "--disable-popup-blocking",
  "--disable-prompt-on-repost",
  "--disable-renderer-backgrounding",
  "--disable-sync",
  "--force-color-profile=srgb",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-crash-upload",
  "--no-pings",
  "--password-store=basic",
  "--use-gl=swiftshader",
  "--use-mock-keychain",
  "--disable-software-rasterizer",
]);

if (!globalThis._clientInstance) {
  console.log("Client instance initalized again");
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: Array.from(args),
    },
  });
  globalThis._clientInstance = client;
} else {
  console.log("Client instance just used again, not created");
  client = globalThis._clientInstance;
}

export default client;
