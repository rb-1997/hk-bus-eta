import { NextResponse } from "next/server";
import {
  fetchKMBStops,
  fetchCTBStops,
  normalizeKMBStop,
  normalizeCTBStop,
} from "@/utils/api";
import { mergeStops } from "@/utils/geo";

export const revalidate = 86400; // 24h

export async function GET() {
  try {
    const [kmbRaw, ctbRaw] = await Promise.all([
      fetchKMBStops().catch(() => []),
      fetchCTBStops().catch(() => []),
    ]);

    const kmb = kmbRaw.map(normalizeKMBStop);
    const ctb = ctbRaw.map(normalizeCTBStop);

    // Merge close stops
    const unified = mergeStops(kmb, ctb, 25);

    return NextResponse.json({
      success: true,
      count: unified.length,
      data: unified,
      generated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Stops API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load stops",
        data: [],
      },
      { status: 500 }
    );
  }
}