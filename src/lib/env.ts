import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env", quiet: true });

const EnvSchema = z.object({
  TZ: z.literal("Asia/Baku"),
  DATABASE_URL: z.string().trim().min(3),
  DIRECT_URL: z.string().trim().min(3),
  GOOGLE_CLIENT_ID: z.string().trim().min(3),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(3),
  GOOGLE_REDIRECT_URI: z.string().trim().min(3),
  GOOGLE_TOKEN: z.string().trim().min(3),
  /** Public https url of this server, lets the sticker generator fetch images from /public. Unset: quotes skip images */
  PUBLIC_BASE_URL: z.url({ protocol: /^https$/ }).optional(),
  STICKER_BASE_URL: z.string().trim().min(3),
  OPENROUTER_API_KEY: z.string().trim().min(3),
  ADOBE_CLIENT_ID: z.string().trim().min(3),
  ADOBE_CLIENT_SECRET: z.string().trim().min(3),
  UNIBOT_PHONE_NUMBER: z.string().trim().min(3),
  SUPER_ADMIN_PHONE_NUMBER: z.string().trim().min(3),
  UNICHAT_GROUP_ID: z.string().trim().min(3),
  INFORMATION_GROUP_ID: z.string().trim().min(3),
  TEST_GROUP_ID: z.string().trim().min(3),
  LOG_GROUP_ID: z.string().trim().min(3),
  FINAL_EXAM_GROUP_ID: z.string().trim().min(3),
});

type EnvSchemaType = z.infer<typeof EnvSchema>;

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.log(parsedEnv.error.flatten().fieldErrors);
  throw new Error("An error happened because of Environment Variables from @/lib/env.ts");
}

export const ENV = parsedEnv.data;

declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvSchemaType {}
  }
}
