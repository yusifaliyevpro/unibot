import { Client, LocalAuth } from "../../lib/whatsapp.ts";

declare global {
  var _clientInstance: Client | undefined;
}

let client: Client;

if (!globalThis._clientInstance) {
  client = new Client({
    authStrategy: new LocalAuth(),
  });
  globalThis._clientInstance = client;
} else {
  client = globalThis._clientInstance;
}

export default client;
