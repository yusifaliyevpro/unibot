import * as dotenv from "dotenv";
dotenv.config();

function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const groups = {
  UNICHAT: getEnvVar("UNICHAT_GROUP_ID"),
  INFORMATION: getEnvVar("INFORMATION_GROUP_ID"),
  TEST: getEnvVar("TEST_GROUP_ID"),
  LOG: getEnvVar("LOG_GROUP_ID"),
  FINAL_EXAM: getEnvVar("FINAL_EXAM_GROUP_ID"),
};

export const SuperAdminID = getEnvVar("SUPER_ADMIN_PHONE_NUMBER");
export const UniBotID = getEnvVar("UNIBOT_PHONE_NUMBER");
export const isInDev = process.env.RAILWAY_ENVIRONMENT_NAME !== "production";
export const BASE_URL = isInDev ? getEnvVar("LOCALHOST_BASE_URL") : getEnvVar("RAILWAY_BASE_URL");
