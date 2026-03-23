import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const EnvSchema = z
  .object({
    TZ: z.literal("Asia/Baku"),
    DATABASE_URL: z.string().trim().min(3),
    DIRECT_URL: z.string().trim().min(3),
    GOOGLE_CLIENT_ID: z.string().trim().min(3),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(3),
    GOOGLE_REDIRECT_URI: z.string().trim().min(3),
    GOOGLE_TOKEN: z.string().trim().min(3),
    LOCALHOST_BASE_URL: z.string().trim().min(3),
    STICKER_BASE_URL: z.string().trim().min(3),
    OPENROUTER_API_KEY: z.string().trim().min(3),
    ADOBE_CLIENT_ID: z.string().trim().min(3),
    ADOBE_CLIENT_SECRET: z.string().trim().min(3),
  })
  .required();

type EnvSchemaType = z.infer<typeof EnvSchema>;

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.log(parsedEnv.error.flatten().fieldErrors);
  throw new Error("An error happened because of Environment Variables from @/lib/env.ts");
}

export const ENV = parsedEnv.data;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ProcessEnv extends EnvSchemaType {}
  }
}
