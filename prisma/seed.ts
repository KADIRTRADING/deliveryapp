/**
 * Development/demo seed data.
 *
 * Every record created here is clearly marked as demo data via naming
 * (e.g. "[DEMO]" prefixes will be added to restaurant/product seeds in later
 * phases). This Phase 1 seed establishes:
 *   1. A minimal Uzbekistan region hierarchy (expanded fully in Phase 2).
 *   2. A SUPER_ADMIN development account so the admin panel is reachable
 *      immediately after `npm run db:seed`, without a manual SQL insert.
 *
 * Never run this against a production database with real user data beyond
 * the initial bootstrap — it is idempotent (safe to re-run) but is intended
 * for local/dev/staging environments only.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Phase 1 baseline data...");

  // --- Minimal region/city hierarchy (Tashkent city + Tashkent region) -----
  // Full 12 regions + Karakalpakstan + Tashkent city, with districts, are
  // seeded in Phase 2 per "UZBEKISTAN-WIDE LOCATION STRUCTURE".
  const tashkentRegion = await prisma.region.upsert({
    where: { code: "TSH" },
    update: {},
    create: {
      code: "TSH",
      nameUz: "Toshkent shahri",
      nameRu: "город Ташкент",
      nameEn: "Tashkent City",
      latitude: 41.2995,
      longitude: 69.2401,
    },
  });

  await prisma.city.upsert({
    where: { code: "TSH-CITY" },
    update: {},
    create: {
      code: "TSH-CITY",
      regionId: tashkentRegion.id,
      nameUz: "Toshkent",
      nameRu: "Ташкент",
      nameEn: "Tashkent",
      latitude: 41.2995,
      longitude: 69.2401,
    },
  });

  // --- Super admin dev account ------------------------------------------------
  const superAdminPhone = "+998900000000";
  const passwordHash = await hashPassword("ChangeMe123!");

  const superAdmin = await prisma.user.upsert({
    where: { phone: superAdminPhone },
    update: {},
    create: {
      phone: superAdminPhone,
      passwordHash,
      firstName: "Super",
      lastName: "Admin",
      phoneVerifiedAt: new Date(),
      roles: { create: [{ role: "SUPER_ADMIN" }] },
    },
  });

  console.log(`✅ Seed complete. Super admin: ${superAdmin.phone} / ChangeMe123! (dev only)`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
