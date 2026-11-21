import { z } from 'zod';
import fs from 'fs';
import path from 'path';

function loadDotenvFiles(): void {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'server/.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (process.env[key] === undefined || process.env[key] === '') {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
}

loadDotenvFiles();

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z
    .string()
    .default('http://localhost:5173')
    .transform((val) => (val === '' ? 'http://localhost:5173' : val)),
  WORKSPACE_ID: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  // Local Ollama Configuration
  OLLAMA_BASE_URL: z
    .string()
    .url('OLLAMA_BASE_URL must be a valid URL')
    .default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z
    .string()
    .default('qwen2.5:3b')
    .transform((val) => (val === '' ? 'qwen2.5:3b' : val)),
  // Cloud AI Provider (Groq - 100% Free Cloud LLM for Production Deployment)
  AI_PROVIDER: z
    .enum(['auto', 'ollama', 'groq'])
    .default('auto'),
  GROQ_API_KEY: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  GROQ_MODEL: z
    .string()
    .default('openai/gpt-oss-120b')
    .transform((val) => (val === '' ? 'openai/gpt-oss-120b' : val)),
  TAVILY_API_KEY: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
  TAVILY_SEARCH_DEPTH: z
    .string()
    .optional()
    .default('basic')
    .transform((val) => (val === 'advanced' ? 'advanced' : 'basic')),
});




function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`\n[ContextMind] Environment configuration errors:\n${formatted}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
