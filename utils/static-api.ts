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
import type { BusStop, BusRoute, ETA, RouteStopSeq } from "@/types/bus";

// ---- simple in-memory caches (session scope) ----
let stopsCache: BusStop[] | null = null;
let stopsCacheAt = 0;
let routesCache: { kmb: any[]; ctb: any[] } | null = null;
let routesCacheAt = 0;
let gmbIndexCache: any[] | null = null;
let mtrIndexCache: any[] | null = null;
const STOPS_TTL = 24 * 3600 * 1000;
const ROUTES_TTL = 24 * 3600 * 1000;

const GMB_PROXY =
  "https://hengfuk-gmb-proxy-rb-1997s-projects.vercel.app/api/gmb-proxy?path=";

async function plainFetch(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const KMB_BASE = "https://data.etabus.gov.hk/v1/transport/kmb";
const CTB_BASE = "https://rt.data.gov.hk/v2/transport/citybus";

const STOPS_LS_KEY = "hkbuseta.stops.v1";

export async function getStops(): Promise<BusStop[]> {
  if (stopsCache && Date.now() - stopsCacheAt < STOPS_TTL) return stopsCache;
  // 1) localStorage (instant on repeat visits)
  try {
    const raw = localStorage.getItem(STOPS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 1000) {
        stopsCache = parsed;
        stopsCacheAt = Date.now();
        return stopsCache;
      }
    }
  } catch {
    /* ignore */
  }
  // 2) bundled static file (fast CDN, no API dependency)
  try {
    const bundled = await plainFetch("stops.json");
    if (Array.isArray(bundled) && bundled.length > 1000) {
      stopsCache = bundled as BusStop[];
      stopsCacheAt = Date.now();
      try {
        localStorage.setItem(STOPS_LS_KEY, JSON.stringify(bundled));
      } catch {
        /* quota — ignore */
      }
      return stopsCache;
    }
  } catch {
    /* fall through to live APIs */
  }
  // 3) live APIs (fallback)
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

  // Green minibus (bundled static index; official API has no CORS)
  try {
    if (!gmbIndexCache) {
      gmbIndexCache = await plainFetch("gmb/index.json").catch(() => []);
    }
    for (const g of gmbIndexCache || []) {
      if (
        q &&
        !g.code.toUpperCase().includes(q) &&
        !(g.dest_tc || "").includes(query.trim()) &&
        !(g.orig_tc || "").includes(query.trim()) &&
        !(g.dest_en || "").toUpperCase().includes(q) &&
        !(g.orig_en || "").toUpperCase().includes(q)
      ) {
        continue;
      }
      routes.push({
        id: `GMB-${g.region}-${g.code}-${g.route_seq}`,
        operator: "GMB",
        route: g.code,
        originEn: g.orig_en || "",
        originTc: g.orig_tc || "",
        destEn: g.dest_en || "",
        destTc: g.dest_tc || "",
        directionLabel: g.route_seq === 1 ? "去程" : "回程",
        gmb: {
          region: g.region,
          code: g.code,
          route_id: g.route_id,
          route_seq: g.route_seq,
        },
      });
    }
  } catch {
    /* GMB index optional */
  }

  // MTR Bus (bundled static index from opendata.mtr.com.hk)
  try {
    if (!mtrIndexCache) {
      mtrIndexCache = await plainFetch("mtr/index.json").catch(() => []);
    }
    for (const m of mtrIndexCache || []) {
      if (
        q &&
        !m.route.toUpperCase().includes(q) &&
        !(m.dest_tc || "").includes(query.trim()) &&
        !(m.orig_tc || "").includes(query.trim()) &&
        !(m.dest_en || "").toUpperCase().includes(q) &&
        !(m.orig_en || "").toUpperCase().includes(q)
      ) {
        continue;
      }
      routes.push({
        id: `MTR-${m.route}-${m.dir}`,
        operator: "MTR",
        route: m.route,
        bound: m.dir as "I" | "O",
        originEn: m.origin_en || "",
        originTc: m.origin_tc || "",
        destEn: m.dest_en || "",
        destTc: m.dest_tc || "",
        directionLabel: m.dir === "I" ? "Inbound" : "Outbound",
      });
    }
  } catch {
    /* MTR index optional */
  }

  return q ? routes : routes.slice(0, 100);
}

export async function getRouteStops(
  route: string,
  operator: "KMB" | "CTB" | "LWB" | "GMB" | "MTR" | null,
  bound: string = "O",
  gmbMeta?: { region: string; code: string; route_id: number; route_seq: number }
): Promise<RouteStopSeq[]> {
  // MTR Bus: bundled per-route JSON from opendata.mtr.com.hk (has coords + names)
  if (operator === "MTR") {
    const dir = bound === "I" || bound === "inbound" ? "I" : "O";
    try {
      const j = await plainFetch(`mtr/routes/${encodeURIComponent(route)}-${dir}.json`);
      return (j.stops || []).map((s: any) => ({
        stop: String(s.stop_id),
        seq: s.seq,
        lat: s.lat ?? undefined,
        lng: s.lng ?? undefined,
        name_tc: s.name_tc,
        name_en: s.name_en,
      }));
    } catch {
      return [];
    }
  }
  // Green minibus: bundled per-route JSON (has coords + names)
  if (operator === "GMB" && gmbMeta) {
    const { region, code, route_seq } = gmbMeta;
    try {
      const j = await plainFetch(
        `gmb/routes/${encodeURIComponent(region)}-${encodeURIComponent(code)}.json`
      );
      const dir =
        (j.directions || []).find((d: any) => d.route_seq === route_seq) ||
        j.directions?.[0];
      if (!dir) return [];
      return (dir.stops || []).map((s: any) => ({
        stop: String(s.stop_id),
        seq: s.seq,
        lat: s.lat ?? undefined,
        lng: s.lng ?? undefined,
        name_tc: s.name_tc,
        name_en: s.name_en,
      }));
    } catch {
      return [];
    }
  }
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
  operator?: "KMB" | "CTB" | "GMB" | "MTR" | null;
  originalId?: string;
  routes?: string; // comma separated, for CTB
  gmb?: {
    route_id: number;
    route_seq: number;
    stop_seq: number;
    code: string;
    dest_tc: string;
    dest_en: string;
  };
  mtr?: {
    routeName: string; // e.g. "K52"
    stopId: string; // e.g. "K52-nD010"
    dest_tc: string;
    dest_en: string;
  };
}

function cleanKmbId(stopId: string, originalId?: string) {
  const kmbId = originalId || stopId.replace(/^kmb-/, "").replace(/^merged-.*-/, "");
  return kmbId.includes("-") ? kmbId.split("-").pop()! : kmbId;
}

export async function getETAs(query: ETAQuery): Promise<ETA[]> {
  const { stopId, operator, originalId, routes } = query;
  if (!stopId && !originalId && !(operator === "GMB" && query.gmb) && !(operator === "MTR" && query.mtr)) return [];
  let etas: ETA[] = [];

  // MTR Bus via rt.data.gov.hk (has CORS *, POST API)
  if (operator === "MTR" && query.mtr) {
    const { routeName, stopId: mtrStopId, dest_tc, dest_en } = query.mtr;
    try {
      const res = await fetch("https://rt.data.gov.hk/v1/transport/mtr/bus/getSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "zh", routeName }),
      }).then((r) => r.json());
      const stop = (res.busStop || []).find((s: any) => s.busStopId === mtrStopId);
      if (stop) {
        etas = (stop.bus || []).slice(0, 3).map((b: any, i: number) => {
          const secs = parseInt(b.departureTimeInSecond || "0", 10);
          const mins = secs >= 108000 ? null : Math.max(0, Math.round(secs / 60));
          return {
            id: `mtr-${routeName}-${mtrStopId}-${i}`,
            operator: "MTR" as const,
            route: routeName,
            destEn: dest_en,
            destTc: dest_tc,
            eta: null,
            etaMinutes: mins,
            remarkEn: b.departureTimeText || undefined,
            remarkTc: b.departureTimeText || undefined,
            sequence: i + 1,
            isRealtime: b.isScheduled !== "1",
          };
        });
      }
    } catch {
      etas = [];
    }
    return etas;
  }

  // Green minibus via the dedicated CORS proxy (official API has no CORS)
  if (operator === "GMB" && query.gmb) {
    const { route_id, route_seq, stop_seq, code, dest_tc, dest_en } = query.gmb;
    try {
      const j = await plainFetch(
        `${GMB_PROXY}eta/route-stop/${route_id}/${route_seq}/${stop_seq}`
      );
      const list = j?.data?.eta || [];
      etas = list.map((e: any, i: number) => ({
        id: `gmb-${route_id}-${route_seq}-${stop_seq}-${e.eta_seq ?? i}`,
        operator: "GMB" as const,
        route: code,
        destEn: dest_en,
        destTc: dest_tc,
        eta: e.timestamp || null,
        etaMinutes: typeof e.diff === "number" ? Math.max(0, e.diff) : null,
        remarkEn: e.remarks_en || undefined,
        remarkTc: e.remarks_tc || undefined,
        sequence: e.eta_seq ?? i + 1,
        isRealtime: !!e.remarks_en && e.remarks_en !== "Scheduled",
      }));
    } catch {
      etas = [];
    }
    return etas;
  }

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

// Cache for stop-links.json
let stopLinksCache: Record<string, {ctb: any[], mtr: any[], gmb: any[]}> | null = null;
async function getStopLinks() {
  if (!stopLinksCache) {
    stopLinksCache = await plainFetch("stop-links.json").catch(() => ({}));
  }
  return stopLinksCache || {};
}

// Cache for CTB stop -> routes
let ctbStopRoutesCache: Record<string, string[]> | null = null;
async function getCtbStopRoutes() {
  if (!ctbStopRoutesCache) {
    ctbStopRoutesCache = await plainFetch("ctb/stop-routes.json").catch(() => ({}));
  }
  return ctbStopRoutesCache || {};
}

/**
 * Get ETAs from ALL operators serving a stop (via cross-operator stop links).
 * For a KMB stop, also queries nearby CTB/MTR/GMB stops.
 */
export async function getAllETAsForStop(
  stop: { id: string; originalIds: { operator: string; id: string }[]; gmb?: any }
): Promise<ETA[]> {
  const allEtas: ETA[] = [];
  const promises: Promise<ETA[]>[] = [];

  // 1. Primary operator ETAs (existing logic)
  const kmbOrig = stop.originalIds.find((o) => o.operator === "KMB");
  const ctbOrig = stop.originalIds.find((o) => o.operator === "CTB");
  if (stop.gmb) {
    promises.push(getETAs({ operator: "GMB", gmb: stop.gmb }));
  } else if (kmbOrig) {
    promises.push(getETAs({ stopId: stop.id, operator: "KMB", originalId: kmbOrig.id }));
  } else if (ctbOrig) {
    // CTB stop without known routes - try to get routes from stop-links or skip
    promises.push(getETAs({ stopId: stop.id, operator: "CTB", originalId: ctbOrig.id, routes: "" }));
  }

  // 2. Cross-operator linked stops
  try {
    const links = await getStopLinks();
    // Try multiple ID formats (kmb-xxx, merged-xxx, raw)
    const linkKey = Object.keys(links).find(k => stop.id.includes(k) || k.includes(stop.id.replace(/^kmb-/, '').replace(/^merged-[^-]+-/, '')));
    const link = linkKey ? links[linkKey] : links[stop.id];
    if (link) {
      // CTB linked stops: query ETA for all routes at that CTB stop
      const ctbRoutes = await getCtbStopRoutes();
      for (const ctb of (link.ctb || []).slice(0, 2)) {
        const routes = (ctbRoutes[ctb.id] || []).slice(0, 5).join(",");
        if (routes) {
          promises.push(
            getETAs({ operator: "CTB", originalId: ctb.id, routes }).catch(() => [] as ETA[])
          );
        }
      }
      // MTR linked stops
      for (const mtr of (link.mtr || []).slice(0, 3)) {
        promises.push(
          getETAs({
            operator: "MTR",
            mtr: {
              routeName: mtr.route,
              stopId: mtr.id,
              dest_tc: mtr.name_tc,
              dest_en: mtr.name_en,
            },
          })
        );
      }
      // GMB linked stops (limit to avoid too many proxy calls)
      for (const g of (link.gmb || []).slice(0, 2)) {
        for (const rd of (g.routes_detail || []).slice(0, 2)) {
          promises.push(
            getETAs({
              operator: "GMB",
              gmb: {
                route_id: rd.route_id,
                route_seq: rd.route_seq,
                stop_seq: rd.stop_seq,
                code: rd.code,
                dest_tc: rd.dest_tc,
                dest_en: rd.dest_en,
              },
            })
          );
        }
      }
    }
  } catch {
    /* links optional */
  }

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "fulfilled") allEtas.push(...r.value);
  }

  // Sort and dedupe
  allEtas.sort((a, b) => {
    if (a.etaMinutes === null) return 1;
    if (b.etaMinutes === null) return -1;
    return a.etaMinutes - b.etaMinutes;
  });
  const seen = new Set<string>();
  return allEtas.filter((e) => {
    const key = `${e.operator}-${e.route}-${e.destEn}-${e.sequence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
