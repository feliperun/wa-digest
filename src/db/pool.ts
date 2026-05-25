import { Pool } from "pg";
import type { AppConfig } from "../config.js";

export interface Queryable {
  query<T = any>(text: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export function createPgPool(config: AppConfig): Pool {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not configured");
  return new Pool({ connectionString: config.databaseUrl });
}
