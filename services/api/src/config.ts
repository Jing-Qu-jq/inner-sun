import "dotenv/config";

/**
 * Central place to read and validate environment configuration.
 * See .env.example at the repo root for the full list of variables.
 */

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const config = {
  /** Port the API listens on locally. */
  port: Number(optional("API_PORT", "3001")),
  host: optional("API_HOST", "127.0.0.1"),
  nodeEnv: optional("NODE_ENV", "development"),
  /** Allowed origin for the web app during local dev. */
  webOrigin: optional("WEB_ORIGIN", "http://localhost:3000"),
} as const;

export const isProduction = config.nodeEnv === "production";
