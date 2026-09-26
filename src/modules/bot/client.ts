import { Client, LocalAuth } from "../../lib/whatsapp.ts";

declare global {
  var _clientInstance: Client | undefined;
}

let client: Client;

if (!globalThis._clientInstance) {
  console.log("Client instance initalized again");
  client = new Client({
    authStrategy: new LocalAuth(),
  });
  globalThis._clientInstance = client;
} else {
  console.log("Client instance just used again, not created");
  client = globalThis._clientInstance;
}

export default client;
