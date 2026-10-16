"use client";

// Client-side data layer for the static (GitHub Pages) build.
// Talks directly to the official open-data endpoints — both KMB and
// Citybus send `Access-Control-Allow-Origin: *`, so no server proxy is needed.
// Logic mirrors the old /api/* route handlers one-to-one.

import {
  normalizeKMBStop,
  normalizeCTBStop,
  normalizeETAFromKMB,
  normalizeETAFromCTB,
} from "@/utils/api";
import { mergeStops } from "@/utils/geo";
import type { BusStop, BusRoute, ETA } from "@/types/bus";

// ---- simple in-memory caches (session scope) ----
let stopsCache: BusStop[] | null = null;
let stopsCacheAt = 0;
let routesCache: { kmb: any[]; ctb: any[] } | null = null;
let routesCacheAt = 0;
const STOPS_TTL = 24 * 3600 * 1000;
const ROUTES_TTL = 24 * 3600 * 1000;

async function plainFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const KMB_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB_BASE = "https://rt.data.gov.hk/v2/transport/citybus";

export async function getStops(): Promise<BusStop[]> {
  if (stopsCache && Date.now() - stopsCacheAt < STOPS_TTL) return stopsCache;
  const [kmbRaw, ctbRaw] = await Promise.all([
    plainFetch(`${KMB_BASE}/stop`).then((j) => j.data || []).catch(() => []),
    plainFetch(`${CTB_BASE}/stop`).then((j) => j.data || []).catch(() => []),
  ]);
  const kmb = kmbRaw.map(normalizeKMBStop);
  const ctb = ctbRaw.map(normalizeCTBStop);
  stopsCache = mergeStops(kmb, ctb, 25);
  stopsCacheAt = Date.now();
  return stopsCache;
}

async function getRawRoutes() {
  if (routesCache && Date.now() - routesCacheAt < ROUTES_TTL) return routesCache;
  const [kmbRaw, ctbRaw] = await Promise.all([
    plainFetch(`${KMB_BASE}/route`).then((j) => j.data || []).catch(() => []),
    plainFetch(`${CTB_BASE}/route/CTB`)
      .then((j) => (Array.isArray(j.data) ? j.data : [j.data]))
      .catch(() => []),
  ]);
  routesCache = { kmb: kmbRaw, ctb: ctbRaw };
  routesCacheAt = Date.now();
  return routesCache;
}

export async function searchRoutes(query: string): Promise<BusRoute[]> {
  const q = query.trim().toUpperCase();
  const { kmb: kmbRaw, ctb: ctbRaw } = await getRawRoutes();
  const routes: BusRoute[] = [];

  for (const r of kmbRaw) {
    if (
      q &&
      !r.route.toUpperCase().includes(q) &&
      !r.dest_en.toUpperCase().includes(q) &&
      !r.orig_en.toUpperCase().includes(q)
    ) {
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

  for (const r of ctbRaw) {
    if (
      q &&
      !r.route.toUpperCase().includes(q) &&
      !r.dest_en.toUpperCase().includes(q) &&
      !r.orig_en.toUpperCase().includes(q)
    ) {
      continue;
    }
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

  routes.sort((a, b) => {
    const numA = parseInt(a.route.replace(/\D/g, "")) || 9999;
    const numB = parseInt(b.route.replace(/\D/g, "")) || 9999;
    if (numA !== numB) return numA - numB;
    return a.route.localeCompare(b.route);
  });

  return q ? routes : routes.slice(0, 100);
}

export async function getRouteStops(
  route: string,
  operator: "KMB" | "CTB" | "LWB" | null,
  bound: string = "O"
): Promise<{ stop: string; seq: number }[]> {
  if (operator === "CTB") {
    const dir = bound === "I" || bound === "inbound" ? "inbound" : "outbound";
    const res = await plainFetch(`${CTB_BASE}/route-stop/CTB/${route}/${dir}`).catch(
      () => ({ data: [] })
    );
    return (res.data || []).map((r: any) => ({ stop: r.stop, seq: r.seq }));
  }
  // KMB: API needs outbound/inbound (fixed from upstream O/I bug)
  const dir = bound === "I" || bound === "inbound" ? "inbound" : "outbound";
  for (const st of ["1", "2"]) {
    const res = await plainFetch(`${KMB_BASE}/route-stop/${route}/${dir}/${st}`).catch(
      () => ({ data: [] })
    );
    const list = (res.data || []).map((r: any) => ({ stop: r.stop, seq: r.seq }));
    if (list.length > 0) return list;
  }
  return [];
}

export interface ETAQuery {
  stopId?: string;
  operator?: "KMB" | "CTB" | null;
  originalId?: string;
  routes?: string; // comma separated, for CTB
}

function cleanKmbId(stopId: string, originalId?: string) {
  const kmbId = originalId || stopId.replace(/^kmb-/, "").replace(/^merged-.*-/, "");
  return kmbId.includes("-") ? kmbId.split("-").pop()! : kmbId;
}

export async function getETAs(query: ETAQuery): Promise<ETA[]> {
  const { stopId, operator, originalId, routes } = query;
  if (!stopId && !originalId) return [];
  let etas: ETA[] = [];

  if (operator === "KMB" || !operator) {
    const cleanId = cleanKmbId(stopId!, originalId);
    try {
      const raw = await plainFetch(`${KMB_BASE}/stop-eta/${cleanId}`).then(
        (j) => j.data || []
      );
      etas = raw.map(normalizeETAFromKMB);
    } catch {
      /* keep empty */
    }
  }

  if ((operator === "CTB" || operator === null) && routes) {
    const ctbId = (originalId || stopId!.replace(/^ctb-/, "").split("-").pop()!);
    const list = routes.split(",").filter(Boolean);
    const results = await Promise.allSettled(
      list.map((r) =>
        plainFetch(`${CTB_BASE}/eta/CTB/${ctbId}/${r.trim()}`)
          .then((j) => (j.data || []).map(normalizeETAFromCTB))
          .catch(() => [])
      )
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") etas.push(...r.value);
    });
  }

  etas.sort((a, b) => {
    if (a.etaMinutes === null) return 1;
    if (b.etaMinutes === null) return -1;
    return a.etaMinutes - b.etaMinutes;
  });

  const seen = new Set<string>();
  return etas.filter((e) => {
    const key = `${e.operator}-${e.route}-${e.destEn}-${e.sequence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
