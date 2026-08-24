import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from './env.js'

/**
 * Prisma 7 passe obligatoirement par un « driver adapter ».
 * Pour migrer vers Postgres : remplacer cet adaptateur par `@prisma/adapter-pg`
 * et basculer `provider` dans schema.prisma. Le reste du code ne bouge pas.
 */
const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })

export async function disconnect(): Promise<void> {
  await prisma.$disconnect()
}
