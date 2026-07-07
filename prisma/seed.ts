/**
 * Production-safe seed: ensures a single admin account exists and nothing else.
 * The community fills the catalog itself.
 *
 * Configure via env (in .env):
 *   ADMIN_USERNAME  – defaults to "admin"
 *   ADMIN_PASSWORD  – REQUIRED in production; falls back to "objectstream"
 *                     for local dev with a loud warning.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  let password = process.env.ADMIN_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ADMIN_PASSWORD env var is required to seed in production — refusing to create an admin with a known default password."
      );
    }
    password = "objectstream";
    console.warn(
      "⚠ ADMIN_PASSWORD not set — using the dev default. Set ADMIN_PASSWORD before deploying anywhere public!"
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username },
    // Never downgrade or overwrite an existing admin's password on re-seed.
    update: { isAdmin: true },
    create: {
      username,
      passwordHash,
      isAdmin: true,
      bio: "Keeping the catalog clean. Report anything weird and I'll take a look!",
    },
  });

  console.log(`✔ admin account ready: ${username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
