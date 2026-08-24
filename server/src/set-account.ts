import { prisma, disconnect } from './db.js'
import { hashPassword } from './auth.js'

/**
 * Cree ou met a jour le compte de la photographe.
 *
 * Les identifiants sont lus dans l'environnement, jamais ecrits dans un
 * fichier : le mot de passe ne doit exister en clair nulle part sur le disque.
 * Seule son empreinte bcrypt est enregistree.
 *
 *   ACCOUNT_EMAIL="..." ACCOUNT_PASSWORD="..." npm run account
 *
 * S'il n'existe qu'un seul compte, il est renomme plutot que double : la
 * propriete des galeries deja creees est ainsi conservee.
 */
async function main() {
  const email = process.env['ACCOUNT_EMAIL']?.toLowerCase().trim()
  const password = process.env['ACCOUNT_PASSWORD']
  const name = process.env['ACCOUNT_NAME']?.trim()

  if (!email || !password) {
    console.error('ACCOUNT_EMAIL et ACCOUNT_PASSWORD sont requis.')
    process.exit(1)
  }
  if (password.length < 10) {
    console.error('Mot de passe trop court : 10 caractères minimum.')
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const sameEmail = await prisma.user.findUnique({ where: { email } })
  if (sameEmail) {
    await prisma.user.update({
      where: { id: sameEmail.id },
      data: { passwordHash, ...(name ? { name } : {}) },
    })
    console.log(`Mot de passe mis a jour pour ${email}`)
    return
  }

  const all = await prisma.user.findMany({
    select: { id: true, email: true, _count: { select: { galleries: true } } },
  })

  if (all.length === 1 && all[0]) {
    const previous = all[0]
    await prisma.user.update({
      where: { id: previous.id },
      data: { email, passwordHash, ...(name ? { name } : {}) },
    })
    console.log(`Compte ${previous.email} renomme en ${email}`)
    console.log(`${previous._count.galleries} galerie(s) conservee(s).`)
    return
  }

  await prisma.user.create({
    data: { email, passwordHash, name: name ?? null },
  })
  console.log(`Compte cree : ${email}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(disconnect)
