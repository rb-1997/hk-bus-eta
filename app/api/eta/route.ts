import { NextRequest, NextResponse } from "next/server";
import {
  fetchKMBStopETA,
  fetchCTBETA,
  normalizeETAFromKMB,
  normalizeETAFromCTB,
} from "@/utils/api";
import type { ETA } from "@/types/bus";

export const revalidate = 20;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stopId = searchParams.get("stopId");
  const operator = searchParams.get("operator") as "KMB" | "CTB" | null;
  const originalId = searchParams.get("originalId");
  const routesParam = searchParams.get("routes"); // comma separated for CTB

  if (!stopId && !originalId) {
    return NextResponse.json(
      { success: false, error: "stopId or originalId required" },
      { status: 400 }
    );
  }

  try {
    let etas: ETA[] = [];

    // Prefer KMB stop-eta as it returns all routes at once for a stop
    if (operator === "KMB" || !operator) {
      const kmbId = originalId || stopId!.replace(/^kmb-/, "").replace(/^merged-.*-/, "");
      // Clean id
      const cleanId = kmbId.includes("-") ? kmbId.split("-").pop()! : kmbId;
      try {
        const kmbRaw = await fetchKMBStopETA(cleanId);
        etas = kmbRaw.map(normalizeETAFromKMB);
      } catch (e) {
        console.warn("KMB ETA error", e);
      }
    }

    // For CTB or merged, if routes provided
    if ((operator === "CTB" || operator === null) && routesParam) {
      const routes = routesParam.split(",").filter(Boolean);
      const ctbId = originalId || stopId!.replace(/^ctb-/, "").split("-").pop()!;
      const promises = routes.map((r) =>
        fetchCTBETA(ctbId, r.trim()).then((raw) => raw.map(normalizeETAFromCTB))
      );
      const results = await Promise.allSettled(promises);
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          etas.push(...r.value);
        }
      });
    }

    // Sort by etaMinutes ascending, nulls last
    etas.sort((a, b) => {
      if (a.etaMinutes === null) return 1;
      if (b.etaMinutes === null) return -1;
      return a.etaMinutes - b.etaMinutes;
    });

    // Dedup by route+dest roughly
    const seen = new Set<string>();
    etas = etas.filter((e) => {
      const key = `${e.operator}-${e.route}-${e.destEn}-${e.sequence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({
      success: true,
      data: etas,
      count: etas.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("ETA API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch ETA",
        data: [],
      },
      { status: 500 }
    );
  }
}