# UniBot

A WhatsApp bot built for our university group — that's where the name comes from. We still actively use it.

## Warning

This project requires domain knowledge to set up and run. If you are not familiar with the technologies involved (NestJS, Prisma, Neon Database, WhatsApp Web, Google Calendar API, etc.), you will likely have a hard time getting it running.

## Prerequisites

- Node.js 22+
- pnpm
- A [Neon](https://neon.tech) PostgreSQL database
- A Google Cloud project with Calendar API enabled and OAuth 2.0 credentials
- An [OpenRouter](https://openrouter.ai) API key
- An [Adobe PDF Services](https://developer.adobe.com/document-services) API key (optional)
- A deployed instance of the sticker generator (optional, see `.env.example`)

## Setup

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd unibot
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy `.env.example` to `.env` and fill in all the required values:

   ```bash
   cp .env.example .env
   ```

4. Push the database schema:

   ```bash
   pnpm db:push
   ```

5. Run in development mode:
   ```bash
   pnpm dev
   ```

On first run, a QR code will appear in the terminal — scan it with WhatsApp to authenticate. Wait at least 2 minutes before editing any code or quiting dev, otherwise you will need to scan QR code next time again. Dev server needs to sync itself especially if you have long chat history, it may take 5 minutes. I highly recommend to use a second number, but this second number must be bought in at least 6 months ago and used normally for a while otherwise Whatsapp can block that. I never faced a ban from Whatsapp.

## Running 24/7

To keep the bot running continuously, you need a server. The project includes a Dockerfile for easy deployment.

Since the project directory is wiped on every deploy, **do not place your `.env` inside the project folder**. Store it separately on the server:

```bash
mkdir -p ~/unibot-env
cp .env ~/unibot-env/.env
```

### Deployment

Build and run the deployment. You can use your own scripts or the provided `deploy.sh`.

1. Update `REPO_SSH` at the top of `deploy.sh` to point to your repository:

```bash
REPO_SSH="git@github.com:your-username/your-repo.git"
```

2. Grant execution permissions for the first-time run:

```bash
chmod +x ./ch.sh
./ch.sh
```

3. Run the deploy script:

```bash
./deploy.sh
```

**Notes:**

- If your repo is private, connect the server to GitHub using a personal access token first. Otherwise `deploy.sh` will not work.
- On first deploy, a QR code will appear — scan it with WhatsApp to pair. The dev server may take a few minutes to sync, especially with long chat history.
- Using a secondary WhatsApp number can reduce the risk of temporary bans, but it should be an established number used for at least 6 months.

## Deprecated

The `deprecated/` folder contains services and features that were built thinking the group would need them, but turned out to be either barely used or made obsolete by WhatsApp itself.

- **Mention all** — sent a mention to every group member. Removed because WhatsApp later added this as a built-in feature.
- **Task manager** — let members add homework assignments and retrieve them via bot commands, with Google Calendar integration to find the next class occurrence. The feature worked but wasn't actively used, so the Prisma model and all related code were commented out.
- **Group registry** — stored group metadata in the database to support features like the daily quote broadcast. Removed along with those features.
- **Daily quotes** — sent a motivational quote to registered groups every morning at 8 AM. Quietly dropped during a refactor.
- **URL shortener** — generated short links with custom slugs stored in the database. Removed during a cleanup pass.
- **Wikipedia search** — searched Wikipedia in Azerbaijani, Turkish, or English and returned a summary with an image. Low usage, so it was cut.
- **QR code generator** — converted any text to a QR code image. Removed alongside other low-traffic handlers.
- **Code screenshot** — rendered code snippets as styled images using [ray.so](https://ray.so) via Puppeteer. Too complex for how rarely it was used.
- **Campus map** — sent a static image of the AzTU campus map on request. Removed during a major refactor, everyone in group now remembers map) (optional)

## 3sual.json

The project uses data scraped from [3sual.az](https://3sual.az). There is a Python scraper for this, but it cannot be shared here. You can either find your own way to scrape the database, or just use the `3sual.json` file already included in the repository.
