/**
 * Development/demo seed data.
 *
 * Every demo business record created here (restaurants, branches, staff
 * accounts) is prefixed "[DEMO]" so it can never be confused with real
 * platform data in a shared staging environment.
 *
 * This seed establishes:
 *   1. The full Uzbekistan administrative hierarchy: the Republic of
 *      Karakalpakstan, all 12 regions, and the independent city of Tashkent
 *      (14 top-level Region rows) — per "Do not hard-code only Tashkent" /
 *      "UZBEKISTAN-WIDE LOCATION STRUCTURE". Each region's administrative
 *      capital is seeded as a City; Tashkent city's 12 constituent
 *      city-districts (tuman) are seeded as District rows.
 *   2. A SUPER_ADMIN development account.
 *   3. A demo restaurant with branches in two different cities (Tashkent and
 *      Samarqand), each with its own delivery zone — demonstrating the
 *      Restaurant → Branch → Location → Delivery Zone structure the spec
 *      requires, and giving Phase 2's serviceability filtering something
 *      real to filter against.
 *
 * Region/city/district coordinates are each administrative centers' public,
 * widely-published approximate coordinates.
 *
 * Idempotent: safe to re-run (uses upsert / findFirst-or-create patterns).
 * Never run against a production database with real user data beyond the
 * initial bootstrap.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { buildSearchText } from "../src/lib/search-normalize";

const prisma = new PrismaClient();

interface RegionSeed {
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  latitude: number;
  longitude: number;
  capitalCode: string;
  capitalNameUz: string;
  capitalNameRu: string;
  capitalNameEn: string;
}

// All 12 regions (viloyat) + the Republic of Karakalpakstan + the
// independent city of Tashkent = 14 top-level administrative units.
const REGIONS: RegionSeed[] = [
  {
    code: "TSH-CITY",
    nameUz: "Toshkent shahri",
    nameRu: "город Ташкент",
    nameEn: "Tashkent City",
    latitude: 41.2995,
    longitude: 69.2401,
    capitalCode: "TSH-CITY-C",
    capitalNameUz: "Toshkent",
    capitalNameRu: "Ташкент",
    capitalNameEn: "Tashkent",
  },
  {
    code: "TSH",
    nameUz: "Toshkent viloyati",
    nameRu: "Ташкентская область",
    nameEn: "Tashkent Region",
    latitude: 41.0378,
    longitude: 69.3439,
    capitalCode: "TSH-C",
    capitalNameUz: "Nurafshon",
    capitalNameRu: "Нурафшан",
    capitalNameEn: "Nurafshon",
  },
  {
    code: "QR",
    nameUz: "Qoraqalpogʻiston Respublikasi",
    nameRu: "Республика Каракалпакстан",
    nameEn: "Republic of Karakalpakstan",
    latitude: 42.4531,
    longitude: 59.6103,
    capitalCode: "QR-C",
    capitalNameUz: "Nukus",
    capitalNameRu: "Нукус",
    capitalNameEn: "Nukus",
  },
  {
    code: "AN",
    nameUz: "Andijon viloyati",
    nameRu: "Андижанская область",
    nameEn: "Andijan Region",
    latitude: 40.7821,
    longitude: 72.3442,
    capitalCode: "AN-C",
    capitalNameUz: "Andijon",
    capitalNameRu: "Андижан",
    capitalNameEn: "Andijan",
  },
  {
    code: "BU",
    nameUz: "Buxoro viloyati",
    nameRu: "Бухарская область",
    nameEn: "Bukhara Region",
    latitude: 39.7747,
    longitude: 64.4286,
    capitalCode: "BU-C",
    capitalNameUz: "Buxoro",
    capitalNameRu: "Бухара",
    capitalNameEn: "Bukhara",
  },
  {
    code: "FA",
    nameUz: "Fargʻona viloyati",
    nameRu: "Ферганская область",
    nameEn: "Fergana Region",
    latitude: 40.3834,
    longitude: 71.7843,
    capitalCode: "FA-C",
    capitalNameUz: "Fargʻona",
    capitalNameRu: "Фергана",
    capitalNameEn: "Fergana",
  },
  {
    code: "JI",
    nameUz: "Jizzax viloyati",
    nameRu: "Джизакская область",
    nameEn: "Jizzakh Region",
    latitude: 40.1158,
    longitude: 67.8422,
    capitalCode: "JI-C",
    capitalNameUz: "Jizzax",
    capitalNameRu: "Джизак",
    capitalNameEn: "Jizzakh",
  },
  {
    code: "NG",
    nameUz: "Namangan viloyati",
    nameRu: "Наманганская область",
    nameEn: "Namangan Region",
    latitude: 40.9983,
    longitude: 71.6726,
    capitalCode: "NG-C",
    capitalNameUz: "Namangan",
    capitalNameRu: "Наманган",
    capitalNameEn: "Namangan",
  },
  {
    code: "NW",
    nameUz: "Navoiy viloyati",
    nameRu: "Навоийская область",
    nameEn: "Navoiy Region",
    latitude: 40.103,
    longitude: 65.3686,
    capitalCode: "NW-C",
    capitalNameUz: "Navoiy",
    capitalNameRu: "Навои",
    capitalNameEn: "Navoiy",
  },
  {
    code: "QA",
    nameUz: "Qashqadaryo viloyati",
    nameRu: "Кашкадарьинская область",
    nameEn: "Qashqadaryo Region",
    latitude: 38.8606,
    longitude: 65.7891,
    capitalCode: "QA-C",
    capitalNameUz: "Qarshi",
    capitalNameRu: "Карши",
    capitalNameEn: "Qarshi",
  },
  {
    code: "SA",
    nameUz: "Samarqand viloyati",
    nameRu: "Самаркандская область",
    nameEn: "Samarqand Region",
    latitude: 39.6542,
    longitude: 66.9597,
    capitalCode: "SA-C",
    capitalNameUz: "Samarqand",
    capitalNameRu: "Самарканд",
    capitalNameEn: "Samarkand",
  },
  {
    code: "SI",
    nameUz: "Sirdaryo viloyati",
    nameRu: "Сырдарьинская область",
    nameEn: "Sirdaryo Region",
    latitude: 40.4897,
    longitude: 68.7842,
    capitalCode: "SI-C",
    capitalNameUz: "Guliston",
    capitalNameRu: "Гулистан",
    capitalNameEn: "Guliston",
  },
  {
    code: "SU",
    nameUz: "Surxondaryo viloyati",
    nameRu: "Сурхандарьинская область",
    nameEn: "Surxondaryo Region",
    latitude: 37.2242,
    longitude: 67.2783,
    capitalCode: "SU-C",
    capitalNameUz: "Termiz",
    capitalNameRu: "Термез",
    capitalNameEn: "Termez",
  },
  {
    code: "XO",
    nameUz: "Xorazm viloyati",
    nameRu: "Хорезмская область",
    nameEn: "Xorazm Region",
    latitude: 41.55,
    longitude: 60.6333,
    capitalCode: "XO-C",
    capitalNameUz: "Urganch",
    capitalNameRu: "Ургенч",
    capitalNameEn: "Urgench",
  },
];

// The 12 city-districts (tuman) of Tashkent city.
const TASHKENT_DISTRICTS = [
  { code: "TSH-D-BEKTEMIR", nameUz: "Bektemir", nameRu: "Бектемир", nameEn: "Bektemir" },
  { code: "TSH-D-CHILANZAR", nameUz: "Chilonzor", nameRu: "Чиланзар", nameEn: "Chilanzar" },
  {
    code: "TSH-D-MIRZOULUGBEK",
    nameUz: "Mirzo Ulugbek",
    nameRu: "Мирзо-Улугбекский",
    nameEn: "Mirzo Ulugbek",
  },
  { code: "TSH-D-MIROBOD", nameUz: "Mirobod", nameRu: "Мирабадский", nameEn: "Mirobod" },
  { code: "TSH-D-OLMAZOR", nameUz: "Olmazor", nameRu: "Алмазарский", nameEn: "Olmazor" },
  { code: "TSH-D-SERGELI", nameUz: "Sergeli", nameRu: "Сергелийский", nameEn: "Sergeli" },
  {
    code: "TSH-D-SHAYXONTOHUR",
    nameUz: "Shayxontohur",
    nameRu: "Шайхантахурский",
    nameEn: "Shaykhantakhur",
  },
  { code: "TSH-D-UCHTEPA", nameUz: "Uchtepa", nameRu: "Учтепинский", nameEn: "Uchtepa" },
  { code: "TSH-D-YAKKASAROY", nameUz: "Yakkasaroy", nameRu: "Яккасарайский", nameEn: "Yakkasaray" },
  { code: "TSH-D-YANGIHAYOT", nameUz: "Yangihayot", nameRu: "Янгихаётский", nameEn: "Yangihayot" },
  { code: "TSH-D-YASHNOBOD", nameUz: "Yashnobod", nameRu: "Яшнободский", nameEn: "Yashnobod" },
  { code: "TSH-D-YUNUSOBOD", nameUz: "Yunusobod", nameRu: "Юнусабадский", nameEn: "Yunusabad" },
];

async function seedLocations() {
  const cityByRegionCode = new Map<string, string>();
  let tashkentCityId: string | null = null;

  for (const region of REGIONS) {
    const regionRow = await prisma.region.upsert({
      where: { code: region.code },
      update: {},
      create: {
        code: region.code,
        nameUz: region.nameUz,
        nameRu: region.nameRu,
        nameEn: region.nameEn,
        latitude: region.latitude,
        longitude: region.longitude,
      },
    });

    const cityRow = await prisma.city.upsert({
      where: { code: region.capitalCode },
      update: {},
      create: {
        code: region.capitalCode,
        regionId: regionRow.id,
        nameUz: region.capitalNameUz,
        nameRu: region.capitalNameRu,
        nameEn: region.capitalNameEn,
        latitude: region.latitude,
        longitude: region.longitude,
      },
    });

    cityByRegionCode.set(region.code, cityRow.id);
    if (region.code === "TSH-CITY") {
      tashkentCityId = cityRow.id;
    }
  }

  if (tashkentCityId) {
    for (const district of TASHKENT_DISTRICTS) {
      await prisma.district.upsert({
        where: { code: district.code },
        update: {},
        create: {
          code: district.code,
          cityId: tashkentCityId,
          nameUz: district.nameUz,
          nameRu: district.nameRu,
          nameEn: district.nameEn,
        },
      });
    }
  }

  return {
    tashkentCityId: cityByRegionCode.get("TSH-CITY")!,
    tashkentRegionId: (await prisma.city.findUnique({ where: { code: "TSH-CITY-C" } }))!.regionId,
    samarqandCityId: cityByRegionCode.get("SA")!,
    samarqandRegionId: (await prisma.city.findUnique({ where: { code: "SA-C" } }))!.regionId,
  };
}

async function seedUsers() {
  const superAdminPhone = "+998900000000";
  const superAdmin = await prisma.user.upsert({
    where: { phone: superAdminPhone },
    update: {},
    create: {
      phone: superAdminPhone,
      passwordHash: await hashPassword("ChangeMe123!"),
      firstName: "Super",
      lastName: "Admin",
      phoneVerifiedAt: new Date(),
      roles: { create: [{ role: "SUPER_ADMIN" }] },
    },
  });

  const ownerPhone = "+998901111111";
  const owner = await prisma.user.upsert({
    where: { phone: ownerPhone },
    update: {},
    create: {
      phone: ownerPhone,
      passwordHash: await hashPassword("ChangeMe123!"),
      firstName: "[DEMO] Aziz",
      lastName: "Karimov",
      phoneVerifiedAt: new Date(),
      roles: { create: [{ role: "RESTAURANT_OWNER" }] },
    },
  });

  return { superAdmin, owner };
}

async function seedDemoRestaurant(
  ownerId: string,
  locations: {
    tashkentCityId: string;
    tashkentRegionId: string;
    samarqandCityId: string;
    samarqandRegionId: string;
  },
) {
  const category = await prisma.restaurantCategory.upsert({
    where: { slug: "uzbek-cuisine" },
    update: {},
    create: {
      slug: "uzbek-cuisine",
      nameUz: "Oʻzbek taomlari",
      nameRu: "Узбекская кухня",
      nameEn: "Uzbek Cuisine",
      sortOrder: 1,
    },
  });

  const restaurantNameUz = "[DEMO] Osh Markazi";
  const restaurantNameRu = "[DEMO] Ош Маркази";
  const restaurantNameEn = "[DEMO] Osh Markazi";
  const restaurantDescUz = "Andozali oʻzbek taomlari — demo restoran.";
  const restaurantDescRu = "Традиционная узбекская кухня — демо-ресторан.";
  const restaurantDescEn = "Traditional Uzbek cuisine — demo restaurant seed data.";

  const existing = await prisma.restaurant.findUnique({ where: { slug: "demo-osh-markazi" } });
  const restaurant =
    existing ??
    (await prisma.restaurant.create({
      data: {
        slug: "demo-osh-markazi",
        nameUz: restaurantNameUz,
        nameRu: restaurantNameRu,
        nameEn: restaurantNameEn,
        descriptionUz: restaurantDescUz,
        descriptionRu: restaurantDescRu,
        descriptionEn: restaurantDescEn,
        searchText: buildSearchText(
          restaurantNameUz,
          restaurantNameRu,
          restaurantNameEn,
          restaurantDescUz,
          restaurantDescRu,
          restaurantDescEn,
        ),
        status: "APPROVED",
        restaurantUsers: { create: [{ userId: ownerId, role: "OWNER" }] },
        categoryLinks: { create: [{ categoryId: category.id }] },
      },
    }));

  const standardHours = {
    mon: [["09:00", "22:00"]],
    tue: [["09:00", "22:00"]],
    wed: [["09:00", "22:00"]],
    thu: [["09:00", "22:00"]],
    fri: [["09:00", "23:00"]],
    sat: [["10:00", "23:00"]],
    sun: [["10:00", "21:00"]],
  };

  let tashkentBranch = await prisma.restaurantBranch.findFirst({
    where: { restaurantId: restaurant.id, name: "[DEMO] Amir Timur Square Branch" },
  });
  if (!tashkentBranch) {
    tashkentBranch = await prisma.restaurantBranch.create({
      data: {
        restaurantId: restaurant.id,
        name: "[DEMO] Amir Timur Square Branch",
        addressLine: "Amir Temur ko'chasi 1, Tashkent",
        regionId: locations.tashkentRegionId,
        cityId: locations.tashkentCityId,
        latitude: 41.311,
        longitude: 69.2797,
        phone: "+998712001122",
        openingHours: standardHours,
      },
    });

    await prisma.deliveryZone.create({
      data: {
        branchId: tashkentBranch.id,
        name: "[DEMO] Central Tashkent 5km",
        type: "RADIUS",
        radiusMeters: 5000,
        baseFee: 12000,
        perKmFee: 2000,
        minOrderAmount: 30000,
        estimatedMinMinutes: 25,
        estimatedMaxMinutes: 50,
      },
    });
  }

  let samarqandBranch = await prisma.restaurantBranch.findFirst({
    where: { restaurantId: restaurant.id, name: "[DEMO] Registan Branch" },
  });
  if (!samarqandBranch) {
    samarqandBranch = await prisma.restaurantBranch.create({
      data: {
        restaurantId: restaurant.id,
        name: "[DEMO] Registan Branch",
        addressLine: "Registon ko'chasi 5, Samarqand",
        regionId: locations.samarqandRegionId,
        cityId: locations.samarqandCityId,
        latitude: 39.6542,
        longitude: 66.9597,
        phone: "+998662001122",
        openingHours: standardHours,
      },
    });

    await prisma.deliveryZone.create({
      data: {
        branchId: samarqandBranch.id,
        name: "[DEMO] Central Samarqand 4km",
        type: "RADIUS",
        radiusMeters: 4000,
        baseFee: 10000,
        perKmFee: 1500,
        minOrderAmount: 25000,
        estimatedMinMinutes: 20,
        estimatedMaxMinutes: 40,
      },
    });
  }

  return restaurant;
}

async function seedDemoMenu(restaurantId: string) {
  const category = await prisma.menuCategory.findFirst({
    where: { restaurantId, nameEn: "[DEMO] Main Dishes" },
  });
  const mainDishes =
    category ??
    (await prisma.menuCategory.create({
      data: {
        restaurantId,
        nameUz: "[DEMO] Asosiy taomlar",
        nameRu: "[DEMO] Основные блюда",
        nameEn: "[DEMO] Main Dishes",
        sortOrder: 1,
      },
    }));

  const existingProduct = await prisma.product.findFirst({
    where: { restaurantId, nameEn: "[DEMO] Uzbek Plov" },
  });
  if (existingProduct) return;

  const plovNameUz = "[DEMO] Oʻzbek Palovi";
  const plovNameRu = "[DEMO] Узбекский плов";
  const plovNameEn = "[DEMO] Uzbek Plov";
  const plovDescUz = "Qazi, sabzi va bedana tuxumi bilan andozali palov.";
  const plovDescRu = "Традиционный плов с казы, морковью и перепелиными яйцами.";
  const plovDescEn = "Traditional plov with beef, carrots, and quail eggs.";

  await prisma.product.create({
    data: {
      restaurantId,
      menuCategoryId: mainDishes.id,
      nameUz: plovNameUz,
      nameRu: plovNameRu,
      nameEn: plovNameEn,
      descriptionUz: plovDescUz,
      descriptionRu: plovDescRu,
      descriptionEn: plovDescEn,
      basePrice: 35000,
      discountedPrice: 29000,
      searchText: buildSearchText(
        plovNameUz,
        plovNameRu,
        plovNameEn,
        plovDescUz,
        plovDescRu,
        plovDescEn,
      ),
      variants: {
        create: [
          {
            nameUz: "Kichik",
            nameRu: "Маленькая",
            nameEn: "Small",
            priceDelta: 0,
            isDefault: true,
          },
          {
            nameUz: "Katta",
            nameRu: "Большая",
            nameEn: "Large",
            priceDelta: 15000,
            sortOrder: 1,
          },
        ],
      },
      modifierGroups: {
        create: [
          {
            nameUz: "Qoʻshimchalar",
            nameRu: "Добавки",
            nameEn: "Extras",
            minSelect: 0,
            maxSelect: 3,
            options: {
              create: [
                {
                  nameUz: "Qoʻshimcha qazi",
                  nameRu: "Доп. казы",
                  nameEn: "Extra beef",
                  priceDelta: 8000,
                },
                {
                  nameUz: "Qoʻshimcha salat",
                  nameRu: "Доп. салат",
                  nameEn: "Extra salad",
                  priceDelta: 5000,
                  sortOrder: 1,
                },
              ],
            },
          },
        ],
      },
    },
  });
}

async function main() {
  console.log("🌱 Seeding Uzbekistan location hierarchy, users, and demo restaurant...");

  const locations = await seedLocations();
  console.log(
    `✅ Seeded ${REGIONS.length} regions/capitals and ${TASHKENT_DISTRICTS.length} Tashkent districts.`,
  );

  const { superAdmin, owner } = await seedUsers();
  console.log(`✅ Super admin: ${superAdmin.phone} / ChangeMe123! (dev only)`);
  console.log(`✅ Demo restaurant owner: ${owner.phone} / ChangeMe123! (dev only)`);

  const restaurant = await seedDemoRestaurant(owner.id, locations);
  console.log(`✅ Demo restaurant ready: ${restaurant.slug} (2 branches: Tashkent, Samarqand)`);

  await seedDemoMenu(restaurant.id);
  console.log("✅ Demo menu ready: 1 category, 1 product with variants + modifiers");

  console.log("🌱 Seed complete.");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
