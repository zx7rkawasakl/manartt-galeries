import 'dotenv/config'
import { z } from 'zod'

/**
 * Configuration validee au demarrage. Un secret manquant ou trop court doit
 * faire echouer le lancement, pas produire des jetons faibles en silence.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET doit faire au moins 32 caractères'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(4000),
  UPLOAD_DIR: z.string().default('./uploads'),
  /**
   * Capacite de stockage annoncee, en Go. Sert de reference a la jauge de
   * l'espace photographe. A ajuster si le disque du serveur change.
   */
  STORAGE_QUOTA_GB: z.coerce.number().positive().default(40),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Configuration invalide :')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')} : ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'

// Un secret de developpement ne doit jamais partir en production.
if (isProduction && env.AUTH_SECRET.startsWith('dev-only')) {
  console.error('AUTH_SECRET est encore le secret de developpement. Regenerez-le.')
  process.exit(1)
}
