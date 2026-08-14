import { NextResponse } from "next/server";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { checkLicense } from "@/lib/license";

export async function GET() {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      logoUrl: companies.logoUrl,
      licenseStatus: companies.licenseStatus,
      licenseExpiresAt: companies.licenseExpiresAt,
    })
    .from(companies)
    .orderBy(companies.name);

  const withAccess = rows.map(({ licenseStatus, licenseExpiresAt, ...rest }) => ({
    ...rest,
    ...checkLicense({ licenseStatus, licenseExpiresAt }),
  }));

  return NextResponse.json({ companies: withAccess });
}
