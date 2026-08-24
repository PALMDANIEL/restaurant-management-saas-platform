import { db } from "@/db";
import { venueShiftSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_SHIFT_SETTINGS = {
  dayStartTime: "07:00",
  dayEndTime: "19:00",
  nightStartTime: "19:00",
  nightEndTime: "06:00",
};

export async function getShiftSettings(venueId: number) {
  const [existing] = await db
    .select()
    .from(venueShiftSettings)
    .where(eq(venueShiftSettings.venueId, venueId))
    .limit(1);
  return existing ?? { venueId, ...DEFAULT_SHIFT_SETTINGS };
}
