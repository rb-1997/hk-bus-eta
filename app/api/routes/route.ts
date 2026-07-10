import { NextRequest, NextResponse } from "next/server";
import {
  fetchKMBRoutes,
  fetchCTBRoutes,
  fetchKMBRouteStops,
  fetchCTBRouteStops,
} from "@/utils/api";
import type { BusRoute } from "@/types/bus";

export const revalidate = 86400;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toUpperCase().trim();
  const detail = searchParams.get("detail"); // if "true" and route given, return stops
  const route = searchParams.get("route");
  const operator = searchParams.get("operator") as "KMB" | "CTB" | "LWB" | null;
  const bound = searchParams.get("bound") || "O";

  try {
    if (detail === "true" && route) {
      // Return route path stops
      let stopIds: { stop: string; seq: number }[] = [];
      if (operator === "CTB") {
        const dir = bound === "I" || bound === "inbound" ? "inbound" : "outbound";
        stopIds = await fetchCTBRouteStops(route, dir);
      } else {
        // KMB default, try both service types if needed
        stopIds = await fetchKMBRouteStops(route, bound === "I" ? "I" : "O", "1");
        if (stopIds.length === 0) {
          stopIds = await fetchKMBRouteStops(route, bound === "I" ? "I" : "O", "2");
        }
      }
      return NextResponse.json({
        success: true,
        data: stopIds,
        route,
        operator: operator || "KMB",
      });
    }

    // List / search routes
    const [kmbRaw, ctbRaw] = await Promise.all([
      fetchKMBRoutes().catch(() => []),
      fetchCTBRoutes().catch(() => []),
    ]);

    const routes: BusRoute[] = [];

    // KMB
    for (const r of kmbRaw) {
      if (q && !r.route.toUpperCase().includes(q) && !r.dest_en.toUpperCase().includes(q) && !r.orig_en.toUpperCase().includes(q)) {
        continue;
      }
      routes.push({
        id: `KMB-${r.route}-${r.bound}-${r.service_type}`,
        operator: "KMB",
        route: r.route,
        serviceType: r.service_type,
        bound: r.bound as "I" | "O",
        originEn: r.orig_en,
        originTc: r.orig_tc,
        destEn: r.dest_en,
        destTc: r.dest_tc,
        directionLabel: r.bound === "I" ? "Inbound" : "Outbound",
      });
    }

    // CTB
    for (const r of ctbRaw) {
      if (q && !r.route.toUpperCase().includes(q) && !r.dest_en.toUpperCase().includes(q) && !r.orig_en.toUpperCase().includes(q)) {
        continue;
      }
      // CTB routes often listed once, directions separate
      routes.push({
        id: `CTB-${r.route}`,
        operator: "CTB",
        route: r.route,
        originEn: r.orig_en,
        originTc: r.orig_tc,
        destEn: r.dest_en,
        destTc: r.dest_tc,
        directionLabel: "Both directions",
      });
    }

    // Sort by route number-ish
    routes.sort((a, b) => {
      const numA = parseInt(a.route.replace(/\D/g, "")) || 9999;
      const numB = parseInt(b.route.replace(/\D/g, "")) || 9999;
      if (numA !== numB) return numA - numB;
      return a.route.localeCompare(b.route);
    });

    // Limit if no query
    const limited = q ? routes : routes.slice(0, 100);

    return NextResponse.json({
      success: true,
      data: limited,
      count: limited.length,
      totalAvailable: routes.length,
    });
  } catch (error: any) {
    console.error("Routes API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed", data: [] },
      { status: 500 }
    );
  }
}