import { AI_MODES, type AiMode, WHATSAPP_MODES, type WhatsAppMode } from '@crm/shared'
import 'dotenv/config'
import { z } from 'zod'

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true')

function emptyToUndefined(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value
}

const optionalString = (minLength = 1) =>
  z.preprocess(emptyToUndefined, z.string().min(minLength).optional())

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    API_HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    REDIS_URL: optionalString(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1800),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(60 * 60 * 24 * 90)
      .default(2_592_000),
    COOKIE_SECURE: booleanString.default(false),
    COOKIE_DOMAIN: optionalString(),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    TRUST_PROXY: booleanString.default(false),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    ENABLE_API_DOCS: booleanString.default(false),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),
    ENABLE_DEV_SIMULATOR: booleanString.default(false),
    CADENCE_WORKER_ENABLED: booleanString.default(true),
    CADENCE_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
    CADENCE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    AI_MODE: z.enum(AI_MODES).default('fallback'),
    AI_MODEL: optionalString(),
    AI_API_KEY: optionalString(8),
    AI_DAILY_LIMIT: z.coerce.number().int().min(0).max(10_000).default(200),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
    APP_VERSION: z.string().default('0.1.0'),
    WHATSAPP_MODE: z.enum(WHATSAPP_MODES).default('disabled'),
    WHATSAPP_VERIFY_TOKEN: optionalString(8),
    WHATSAPP_APP_SECRET: optionalString(8),
    WHATSAPP_ACCESS_TOKEN: optionalString(8),
    WHATSAPP_PHONE_NUMBER_ID: optionalString(),
    WHATSAPP_WABA_ID: optionalString(),
    WHATSAPP_API_VERSION: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^v\d+\.\d+$/)
        .default('v23.0'),
    ),
    WHATSAPP_INITIAL_MESSAGE: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .min(1)
        .max(1024)
        .default(
          'Olá! Que bom ter você aqui. Para eu te ajudar melhor, qual procedimento ou tratamento despertou seu interesse?',
        ),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.AI_MODE === 'llm' && !value.AI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_API_KEY'],
        message: 'AI_API_KEY é obrigatória quando AI_MODE=llm',
      })
    }

    if (value.WHATSAPP_MODE !== 'live') {
      return
    }

    const requiredFields = [
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
    ] as const

    for (const field of requiredFields) {
      if (!value[field]) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} é obrigatória quando WHATSAPP_MODE=live`,
        })
      }
    }
  })

export interface AppConfig {
  env: 'development' | 'test' | 'production'
  port: number
  host: string
  databaseUrl: string
  redisUrl: string | null
  jwtSecret: string
  accessTokenTtlSeconds: number
  refreshTokenTtlSeconds: number
  cookieSecure: boolean
  cookieDomain: string | null
  webOrigin: string
  trustProxy: boolean
  logLevel: string
  enableApiDocs: boolean
  devSimulatorEnabled: boolean
  rateLimitMax: number
  rateLimitWindow: string
  cadenceWorkerEnabled: boolean
  cadenceWorkerIntervalMs: number
  cadenceMaxAttempts: number
  aiMode: AiMode
  aiModel: string | null
  aiApiKey: string | null
  aiDailyLimit: number
  aiTimeoutMs: number
  version: string
  whatsappMode: WhatsAppMode
  whatsappVerifyToken: string | null
  whatsappAppSecret: string | null
  whatsappAccessToken: string | null
  whatsappPhoneNumberId: string | null
  whatsappWabaId: string | null
  whatsappApiVersion: string
  whatsappInitialMessage: string
}

export function toAppConfig(values: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(values)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuração inválida: ${issues}`)
  }

  const env = parsed.data

  return {
    env: env.NODE_ENV,
    port: env.API_PORT,
    host: env.API_HOST,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL ?? null,
    jwtSecret: env.JWT_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    cookieSecure: env.COOKIE_SECURE,
    cookieDomain: env.COOKIE_DOMAIN ?? null,
    webOrigin: env.WEB_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL,
    enableApiDocs: env.ENABLE_API_DOCS,
    devSimulatorEnabled: env.ENABLE_DEV_SIMULATOR,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindow: env.RATE_LIMIT_WINDOW,
    cadenceWorkerEnabled: env.CADENCE_WORKER_ENABLED,
    cadenceWorkerIntervalMs: env.CADENCE_WORKER_INTERVAL_MS,
    cadenceMaxAttempts: env.CADENCE_MAX_ATTEMPTS,
    aiMode: env.AI_MODE,
    aiModel: env.AI_MODEL ?? null,
    aiApiKey: env.AI_API_KEY ?? null,
    aiDailyLimit: env.AI_DAILY_LIMIT,
    aiTimeoutMs: env.AI_TIMEOUT_MS,
    version: env.APP_VERSION,
    whatsappMode: env.WHATSAPP_MODE,
    whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN ?? null,
    whatsappAppSecret: env.WHATSAPP_APP_SECRET ?? null,
    whatsappAccessToken: env.WHATSAPP_ACCESS_TOKEN ?? null,
    whatsappPhoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? null,
    whatsappWabaId: env.WHATSAPP_WABA_ID ?? null,
    whatsappApiVersion: env.WHATSAPP_API_VERSION,
    whatsappInitialMessage: env.WHATSAPP_INITIAL_MESSAGE,
  }
}

let cachedConfig: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = toAppConfig(process.env)
  }

  return cachedConfig
}
