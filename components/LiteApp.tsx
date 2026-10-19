"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Search,
  MapPin,
  Star,
  StarOff,
  X,
  LocateFixed,
  RefreshCw,
  ChevronDown,
  Bus,
  Navigation,
  Heart,
} from "lucide-react";
import type { BusStop, ETA, BusRoute, FavoriteRoute, FavoriteRouteStop, RouteStopSeq } from "@/types/bus";
import { useETA, useRouteSearch, useRouteStops, useStops } from "@/hooks/useBusData";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useFavorites } from "@/hooks/useFavorites";
import { useFavoriteRoutes } from "@/hooks/useFavoriteRoutes";
import { useFavoriteHearts } from "@/hooks/useFavoriteHearts";
import { useRoutesSortedByDistance } from "@/hooks/useRoutesSortedByDistance";
import { MTRTStationETAs } from "@/components/MTRTStationETAs";
import { LRTStationETAs } from "@/components/LRTStationETAs";
import { useNearbyTransport } from "@/hooks/useNearbyTransport";
import { NearbyTransportCard } from "@/components/NearbyTransportCard";
import { HeartFocusView } from "@/components/HeartFocusView";
import { HeartListItem } from "@/components/HeartListItem";
import { findClosestStops, haversineDistance } from "@/utils/geo";
import clsx from "clsx";

/* ---------- shared bits ---------- */

function OperatorBadge({ operator }: { operator: string }) {
  if (operator === "KMB" || operator === "LWB") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white shrink-0">
        九巴
      </span>
    );
  }
  if (operator === "GMB") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shrink-0">
        小巴
      </span>
    );
  }
  if (operator === "MTR") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#c0392b] text-white shrink-0">
        港鐵
      </span>
    );
  }
  if (operator === "MTRT") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#8e44ad] text-white shrink-0">
        鐵路
      </span>
    );
  }
  if (operator === "LRT") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e67e22] text-white shrink-0">
        輕鐵
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shrink-0">
      城巴
    </span>
  );
}

function etaText(e: ETA): string {
  if (e.etaMinutes === null) return e.remarkTc || e.remarkEn || "—";
  if (e.etaMinutes <= 0) return "即將到站";
  const arrival = new Date(Date.now() + e.etaMinutes * 60000);
  const hh = String(arrival.getHours()).padStart(2, "0");
  const mm = String(arrival.getMinutes()).padStart(2, "0");
  return `${e.etaMinutes} 分鐘 (${hh}:${mm})`;
}

function etaColor(e: ETA): string {
  if (e.etaMinutes === null) return "text-slate-400";
  if (e.etaMinutes <= 1) return "text-emerald-600";
  if (e.etaMinutes <= 5) return "text-amber-600";
  return "text-slate-700";
}

// Urgent: bus arriving within 3 minutes -> red flashing
function isUrgent(e: ETA): boolean {
  return e.etaMinutes !== null && e.etaMinutes <= 3 && e.etaMinutes >= 0;
}

/* ---------- nearby stop card with live ETAs ---------- */

function NearbyStopCard({
  stop,
  distance,
  isFavorite,
  toggleFavorite,
  defaultExpanded,
  onTapRoute,
}: {
  stop: BusStop;
  distance: number;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (stop: BusStop) => void;
  defaultExpanded: boolean;
  onTapRoute: (eta: ETA) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { etas, isLoading, refresh } = useETA(stop, true);
  const fav = isFavorite(stop.id);

  const shown = expanded ? etas : etas.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 text-[17px] truncate">
              {stop.nameTc || stop.nameEn}
            </span>
            <span className="text-[12px] text-sky-600 font-medium tabular-nums shrink-0">
              {distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`}
            </span>
          </div>
          {stop.nameTc && stop.nameEn && stop.nameTc !== stop.nameEn && (
            <div className="text-[13px] text-slate-400 truncate mt-0.5">{stop.nameEn}</div>
          )}
        </div>
        <ChevronDown
          className={clsx("w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform", expanded && "rotate-180")}
        />
      </button>

      <div className="px-4 pb-1">
        {isLoading && etas.length === 0 ? (
          <div className="py-3 text-[14px] text-slate-400">載入班次中…</div>
        ) : shown.length === 0 ? (
          <div className="py-3 text-[14px] text-slate-400">暫時冇班次資料</div>
        ) : (
          shown.map((e) => (
            <button
              key={e.id}
              onClick={() => onTapRoute(e)}
              className="w-full flex items-center gap-2 py-2 border-t border-slate-50 active:bg-sky-50 text-left"
            >
              <OperatorBadge operator={e.operator} />
              <span className="font-bold text-sky-700 text-[15px] tabular-nums underline decoration-sky-200 underline-offset-2">{e.route}</span>
              <span className="text-[13px] text-slate-500 truncate flex-1">
                往 {e.destTc || e.destEn}
              </span>
              <span className={clsx("text-[14px] font-semibold tabular-nums shrink-0", etaColor(e), isUrgent(e) && "eta-urgent")}>
                {etaText(e)}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/60">
        <button
          onClick={() => refresh()}
          className="flex items-center gap-1 text-[13px] text-slate-500 active:text-sky-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          更新
        </button>
        <button
          onClick={() => toggleFavorite(stop)}
          className="flex items-center gap-1 text-[13px] text-slate-500 active:text-amber-500"
          aria-label="收藏車站"
        >
          {fav ? (
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          ) : (
            <StarOff className="w-4 h-4" />
          )}
          {fav ? "已收藏" : "收藏車站"}
        </button>
      </div>
    </div>
  );
}

/* ---------- route stop row (per-stop live ETA) ---------- */

function LiteRouteStopRow({
  seq,
  nameTc,
  nameEn,
  route,
  gmbMeta,
  kmbStopId,
  ctbStopId,
  mtrMeta,
  isHeart,
  onToggleHeart,
}: {
  seq: number;
  nameTc?: string;
  nameEn?: string;
  route: BusRoute;
  gmbMeta?: { region: string; code: string; route_id: number; route_seq: number };
  kmbStopId?: string;
  ctbStopId?: string;
  mtrMeta?: { routeName: string; stopId: string };
  isHeart?: (route: BusRoute, seq: number) => boolean;
  onToggleHeart?: (route: BusRoute, seq: number, nameTc?: string, nameEn?: string) => void;
}) {
  const { data: etas } = useSWR(
    route.operator === "GMB" && gmbMeta
      ? (["lite-eta-gmb", gmbMeta.route_id, gmbMeta.route_seq, seq] as const)
      : route.operator === "KMB" && kmbStopId
        ? (["lite-eta-kmb", kmbStopId, route.route] as const)
        : route.operator === "CTB" && ctbStopId
          ? (["lite-eta-ctb", ctbStopId, route.route] as const)
          : route.operator === "MTR" && mtrMeta
            ? (["lite-eta-mtr", mtrMeta.routeName, mtrMeta.stopId] as const)
            : null,
    async (key: readonly [string, ...unknown[]]) => {
      const { getETAs } = await import("@/utils/static-api");
      if (key[0] === "lite-eta-gmb" && gmbMeta) {
        return getETAs({
          operator: "GMB",
          gmb: {
            route_id: gmbMeta.route_id,
            route_seq: gmbMeta.route_seq,
            stop_seq: seq,
            code: gmbMeta.code,
            dest_tc: route.destTc,
            dest_en: route.destEn,
          },
        });
      } else if (key[0] === "lite-eta-kmb" && kmbStopId) {
        const all = await getETAs({ operator: "KMB", originalId: kmbStopId });
        return all.filter((e) => e.route === route.route).slice(0, 3);
      } else if (key[0] === "lite-eta-ctb" && ctbStopId) {
        return getETAs({ operator: "CTB", originalId: ctbStopId, routes: route.route });
      } else if (key[0] === "lite-eta-mtr" && mtrMeta) {
        return getETAs({
          operator: "MTR",
          mtr: {
            routeName: mtrMeta.routeName,
            stopId: mtrMeta.stopId,
            dest_tc: route.destTc,
            dest_en: route.destEn,
          },
        });
      }
      return [];
    },
    { revalidateOnFocus: false, dedupingInterval: 30000, errorRetryCount: 1 }
  );

  const { data: ctbName } = useSWR(
    route.operator === "CTB" && ctbStopId && !nameTc
      ? (["lite-ctb-name", ctbStopId] as const)
      : null,
    async () => {
      const { normalizeCTBStop } = await import("@/utils/api");
      const res = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/stop/${ctbStopId}`)
        .then((r) => r.json())
        .catch(() => null);
      if (res?.data) {
        const n = normalizeCTBStop(res.data);
        return { nameTc: n.nameTc, nameEn: n.nameEn };
      }
      return null;
    },
    { revalidateOnFocus: false, dedupingInterval: 86400000, errorRetryCount: 1 }
  );

  const displayTc = nameTc || ctbName?.nameTc;
  const displayEn = nameEn || ctbName?.nameEn;
  const list = (etas || []).slice(0, 3);

  return (
    <div className="flex items-center gap-2 py-2.5 px-1 border-b border-slate-100 last:border-0">
      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[13px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
        {seq}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium text-slate-900 truncate">
          {displayTc || displayEn || `第 ${seq} 站`}
        </div>
        {displayTc && displayEn && displayTc !== displayEn && (
          <div className="text-[13px] text-slate-400 truncate">{displayEn}</div>
        )}
      </div>
      {onToggleHeart && (
        <button
          onClick={() => onToggleHeart(route, seq, displayTc, displayEn)}
          className="p-1.5 shrink-0 active:scale-90 transition"
          aria-label={isHeart?.(route, seq) ? "取消心水站" : "設為心水站"}
        >
          <Heart
            className={clsx(
              "w-4.5 h-4.5",
              isHeart?.(route, seq)
                ? "text-rose-500 fill-rose-500"
                : "text-slate-300"
            )}
          />
        </button>
      )}
      <div className="shrink-0 text-right">
        {!etas ? (
          <span className="text-[13px] text-slate-300">…</span>
        ) : list.length === 0 ? (
          <span className="text-[13px] text-slate-300">—</span>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            {list.map((e, i) => (
              <span key={i} className={clsx("text-[14px] font-semibold tabular-nums", etaColor(e), isUrgent(e) && "eta-urgent")}>
                {etaText(e)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LiteRouteStopsList({
  route,
  stopSeqs,
  stops,
  isHeart,
  onToggleHeart,
  highlightSeq,
}: {
  route: BusRoute;
  stopSeqs: RouteStopSeq[];
  stops: BusStop[];
  isHeart?: (route: BusRoute, seq: number) => boolean;
  onToggleHeart?: (route: BusRoute, seq: number, nameTc?: string, nameEn?: string) => void;
  highlightSeq?: number | null;
}) {
  const enriched = useMemo(() => {
    const byOrig = new Map<string, BusStop>();
    stops.forEach((s) => {
      s.originalIds.forEach((o) => byOrig.set(o.id, s));
      byOrig.set(s.id, s);
    });
    return [...stopSeqs]
      .sort((a, b) => a.seq - b.seq)
      .map((ss) => {
        if (ss.lat != null && ss.lng != null) {
          return {
            seq: ss.seq,
            nameTc: ss.name_tc,
            nameEn: ss.name_en,
            gmbMeta: route.gmb,
            kmbStopId: undefined as string | undefined,
            ctbStopId: undefined as string | undefined,
            mtrMeta:
              route.operator === "MTR"
                ? { routeName: route.route, stopId: ss.stop }
                : undefined,
          };
        }
        const found = byOrig.get(ss.stop);
        return {
          seq: Number(ss.seq) || 0,
          nameTc: found?.nameTc,
          nameEn: found?.nameEn,
          gmbMeta: undefined,
          kmbStopId: route.operator === "KMB" ? ss.stop : undefined,
          ctbStopId: route.operator === "CTB" ? ss.stop : undefined,
          mtrMeta: undefined,
        };
      });
  }, [stopSeqs, stops, route]);

  if (enriched.length === 0) return null;
  return (
    <div className="mt-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 text-[13px] font-semibold text-slate-500">
        {route.route} · {enriched.length} 個站 · 即時到站
      </div>
      <div className="px-3 pb-2">
        {enriched.map((s) => (
          <div
            key={s.seq}
            ref={(el) => {
              if (el && highlightSeq === s.seq) {
                el.scrollIntoView({ block: "center", behavior: "smooth" });
              }
            }}
            className={clsx(
              "rounded-xl transition-colors",
              highlightSeq === s.seq && "bg-rose-50 ring-1 ring-rose-200"
            )}
          >
            <LiteRouteStopRow
              seq={s.seq}
              nameTc={s.nameTc}
              nameEn={s.nameEn}
              route={route}
              gmbMeta={s.gmbMeta}
              kmbStopId={s.kmbStopId}
              ctbStopId={s.ctbStopId}
              mtrMeta={s.mtrMeta}
              isHeart={isHeart}
              onToggleHeart={onToggleHeart}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- main lite app ---------- */

type Tab = "nearby" | "routes" | "favorites";

// Component to show ETAs for a stop search result
function StopSearchResultETAs({ stop }: { stop: any }) {
  const { data: etas, isLoading } = useSWR(
    ["stop-search-etas", stop.id],
    async () => {
      const { getAllETAsForStop } = await import("@/utils/static-api");
      // Convert stop to the format getAllETAsForStop expects
      const stopObj = {
        id: stop.id,
        originalIds: stop.originalIds || [{ operator: "KMB", id: stop.id.replace(/^kmb-/, "") }],
        nameTc: stop.nameTc,
        nameEn: stop.nameEn,
      };
      return getAllETAsForStop(stopObj as any);
    },
    { refreshInterval: 30000, revalidateOnFocus: false }
  );

  if (isLoading) {
    return <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">載入班次中…</div>;
  }

  const list = etas || [];
  if (list.length === 0) {
    return <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">暫無班次資料</div>;
  }

  // Group by route + destination, keep earliest first
  const grouped = new Map<string, any[]>();
  for (const e of list) {
    const key = `${e.operator}-${e.route}-${e.destTc || e.destEn}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }
  // Sort each group by etaMinutes (earliest first), then sort groups by earliest ETA
  const groups = Array.from(grouped.values()).map(g => {
    g.sort((a, b) => (a.etaMinutes ?? 9999) - (b.etaMinutes ?? 9999));
    return g;
  });
  groups.sort((a, b) => (a[0].etaMinutes ?? 9999) - (b[0].etaMinutes ?? 9999));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="font-semibold text-[16px]">{stop.nameTc}</div>
        {stop.nameEn && <div className="text-[13px] text-slate-400">{stop.nameEn}</div>}
      </div>
      <div className="px-4 pb-2">
        {groups.map((g, gi) => {
          const first = g[0];
          return (
            <div key={gi} className="py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-700 text-[15px]">{first.route}</span>
                <span className="text-[13px] text-slate-500 flex-1 truncate">往 {first.destTc || first.destEn}</span>
                <span className="text-[14px] font-semibold">
                  {first.etaMinutes !== null ? `${first.etaMinutes} 分鐘` : "—"}
                </span>
              </div>
              {g.length > 1 && (
                <div className="flex gap-2 mt-1 ml-1">
                  {g.slice(1, 4).map((e: any) => (
                    <span key={e.id} className="text-[12px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                      {e.etaMinutes !== null ? `${e.etaMinutes}′` : "—"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LiteApp() {
  const [tab, setTab] = useState<Tab>("nearby");
  const [favTab, setFavTab] = useState<"hearts" | "routes" | "stops">("hearts");
  const [routeQuery, setRouteQuery] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  const [heartFocus, setHeartFocus] = useState<FavoriteRouteStop | null>(null);
  const [editOrder, setEditOrder] = useState(false);
  const [highlightSeq, setHighlightSeq] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useSWRConfig();

  const {
    lat: userLat,
    lng: userLng,
    loading: geoLoading,
    permission,
    requestLocation,
  } = useGeolocation(true);

  const { stops, isLoading: stopsLoading } = useStops();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const { favRoutes, isFavRoute, toggleFavRoute, removeFavRoute } = useFavoriteRoutes();
  const { hearts, isHeart, toggleHeart, removeHeart, moveHeart } = useFavoriteHearts();
  const { routes: searchedRoutes, isLoading: routesLoading } = useRouteSearch(routeQuery);
  const sortedRoutes = useRoutesSortedByDistance(searchedRoutes, userLat, userLng);

  const operatorForApi =
    selectedRoute?.operator === "LWB"
      ? "KMB"
      : selectedRoute?.operator === "MTRT" || selectedRoute?.operator === "LRT"
        ? null // MTRT/LRT handled separately (station-based, not route-based)
        : (selectedRoute?.operator ?? null);
  const { stopSeqs, isLoading: stopsListLoading } = useRouteStops(
    selectedRoute?.route || null,
    operatorForApi,
    selectedRoute?.bound || "O",
    selectedRoute?.gmb
  );

  // Nearby stops within 800m, top 8
  // Nearby: ALL transport within 800m (bus + MTR + Light Rail), no limit, sorted by distance
  const nearby = useNearbyTransport(userLat, userLng, stops);

  const hasLocation = !!userLat && !!userLng;
  const showLocatePrompt = !hasLocation && !geoLoading;

  const handleSelectFavRoute = (fr: FavoriteRoute) => {
    setSelectedRoute({
      id: fr.id,
      route: fr.route,
      operator: fr.operator,
      originTc: fr.originTc,
      originEn: fr.originEn,
      destTc: fr.destTc,
      destEn: fr.destEn,
      directionLabel: fr.directionLabel,
      bound: fr.bound,
      gmb: fr.gmb,
    });
    setTab("routes");
  };

  // Tap a route in the nearby ETA list -> jump to its full stop list
  const handleTapEtaRoute = async (eta: ETA) => {
    try {
      const { searchRoutes } = await import("@/utils/static-api");
      const candidates = await searchRoutes(eta.route);
      // Prefer same operator, then match destination
      const sameOp = candidates.filter((r) => r.operator === eta.operator);
      const pool = sameOp.length > 0 ? sameOp : candidates;
      let best: BusRoute | null = null;
      if (eta.destTc) {
        best = pool.find((r) => r.destTc === eta.destTc || r.destEn === eta.destEn) || null;
      }
      if (!best) {
        best =
          pool.find(
            (r) =>
              (eta.destTc && (r.destTc.includes(eta.destTc) || eta.destTc.includes(r.destTc))) ||
              (eta.destEn && (r.destEn.toLowerCase().includes(eta.destEn.toLowerCase()) || eta.destEn.toLowerCase().includes(r.destEn.toLowerCase())))
          ) || null;
      }
      if (!best) best = pool[0] || null;
      if (best) {
        setRouteQuery("");
        setSelectedRoute(best);
        setHighlightSeq(null);
        setTab("routes");
      }
    } catch {
      /* ignore */
    }
  };

  // View MTR/LRT station detail from nearby card
  // Converts NearbyTransport item to BusRoute and shows station ETAs
  const handleViewStation = (item: import("@/hooks/useNearbyTransport").NearbyTransport) => {
    let br: BusRoute | null = null;
    if (item.kind === "mtr" && item.mtrt) {
      br = {
        id: `MTRT-${item.mtrt.line}-${item.mtrt.sta}`,
        operator: "MTRT",
        route: `${item.nameTc}`,
        originTc: item.mtrt.sta,
        originEn: item.mtrt.sta,
        destTc: item.mtrt.lineTc,
        destEn: item.mtrt.lineEn,
        directionLabel: `${item.mtrt.lineTc}`,
        mtrt: {
          line: item.mtrt.line,
          sta: item.mtrt.sta,
          lineTc: item.mtrt.lineTc,
          lineEn: item.mtrt.lineEn,
          staTc: item.nameTc.replace("站", ""),
          staEn: item.nameEn.replace(" Station", ""),
        },
      };
    } else if (item.kind === "lrt" && item.lrt) {
      br = {
        id: `LRT-${item.lrt.stationId}`,
        operator: "LRT",
        route: `${item.lrt.tc}站`,
        originTc: item.lrt.tc,
        originEn: item.lrt.en,
        destTc: "輕鐵",
        destEn: "Light Rail",
        directionLabel: `輕鐵 · ${item.lrt.tc}`,
        lrt: {
          stationId: item.lrt.stationId,
          tc: item.lrt.tc,
          en: item.lrt.en,
        },
      };
    }
    if (br) {
      setRouteQuery("");
      setSelectedRoute(br);
      setHighlightSeq(null);
      setTab("routes");
    }
  };

  // Heart: toggle a specific stop on the current route as "心水站"
  const handleToggleHeart = (route: BusRoute, seq: number, nameTc?: string, nameEn?: string) => {
    toggleHeart({ route, stopSeq: seq, stopNameTc: nameTc || "", stopNameEn: nameEn || "" });
  };

  // Tap a heart favorite -> jump to that route, scrolled to the saved stop
  const handleTapHeart = (h: FavoriteRouteStop) => {
    // Show ONLY this one stop, not the full list
    setRouteQuery("");
    setSelectedRoute(null);
    setHeartFocus(h);
    setHighlightSeq(null);
    setTab("routes");
  };

  const favCount = favorites.length + favRoutes.length + hearts.length;

  return (
    <main className="h-[100dvh] w-full flex flex-col bg-slate-100 overflow-hidden">
      {/* header */}
      <header className="shrink-0 sticky top-0 z-20 bg-white border-b border-slate-200 px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={requestLocation}
            disabled={geoLoading}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-sky-500 text-white shadow-md shadow-sky-500/25 active:scale-95 transition disabled:opacity-60 shrink-0"
            aria-label="定位"
          >
            <LocateFixed className={clsx("w-5 h-5", geoLoading && "animate-pulse")} />
          </button>
          {(heartFocus || selectedRoute || routeQuery) && (
            <button
              onClick={() => {
                setHeartFocus(null);
                setSelectedRoute(null);
                setRouteQuery("");
                setTab("nearby");
              }}
              className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 active:scale-95 transition shrink-0"
              aria-label="主頁"
            >
              <span className="text-[20px]">🏠</span>
            </button>
          )}
          {(heartFocus || selectedRoute) && (
            <button
              onClick={() => {
                setHeartFocus(null);
                setSelectedRoute(null);
              }}
              className="flex items-center justify-center h-11 px-3 rounded-2xl bg-slate-100 text-sky-600 text-[15px] font-medium active:scale-95 transition shrink-0"
              aria-label="返回"
            >
              ← 返回
            </button>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="搜路線，例如 261、44B1、K52"
              value={routeQuery}
              onChange={(e) => {
                setRouteQuery(e.target.value);
                setTab("routes");
                setSelectedRoute(null);
                setHeartFocus(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  inputRef.current?.blur();
                }
              }}
              className="w-full h-11 pl-10 pr-9 rounded-2xl bg-slate-100 border-0 text-[17px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            {routeQuery && (
              <button
                onClick={() => {
                  setRouteQuery("");
                  setSelectedRoute(null);
                  setHeartFocus(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="清除"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => {
              inputRef.current?.blur();
              if (routeQuery.trim()) {
                setTab("routes");
                setHeartFocus(null);
                setSelectedRoute(null);
              }
            }}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 active:bg-sky-500 active:text-white active:scale-95 transition shrink-0"
            aria-label="搜尋"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              mutate(() => true);
              if (tab === "nearby") requestLocation();
            }}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 active:bg-sky-500 active:text-white active:scale-95 transition shrink-0"
            aria-label="重新整理"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* tabs */}
        <div className="flex p-1 bg-slate-100 rounded-2xl mt-2.5">
          {(
            [
              { id: "nearby", label: "附近", icon: MapPin },
              { id: "routes", label: "路線", icon: Bus },
              { id: "favorites", label: `★ ${favCount}`, icon: Star },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={clsx(
                "flex-1 py-2 text-[14px] font-medium rounded-xl transition-all flex items-center justify-center gap-1",
                tab === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3">
        {tab === "nearby" && (
          <>
            {showLocatePrompt && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-3">
                  <Navigation className="w-7 h-7 text-sky-600" />
                </div>
                <h2 className="font-semibold text-slate-900 text-[17px] mb-1">
                  撳一下，即刻睇附近有咩車
                </h2>
                <p className="text-[14px] text-slate-500 mb-4">
                  定位後自動列出 800 米內所有車站＋實時班次
                </p>
                <button
                  onClick={requestLocation}
                  className="px-6 py-3 rounded-2xl bg-sky-500 text-white font-semibold text-[17px] shadow-md shadow-sky-500/25 active:scale-95 transition"
                >
                  📍 定位我嘅位置
                </button>
              </div>
            )}

            {geoLoading && (
              <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                定位緊…
              </div>
            )}

            {hasLocation && stopsLoading && (
              <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                載入車站資料緊…
              </div>
            )}

            {hasLocation && !stopsLoading && nearby.length === 0 && (
              <div className="bg-white rounded-2xl p-6 text-center">
                <p className="text-[15px] text-slate-500">
                  800 米內冇車站紀錄
                  <br />
                  試下用上面搜尋路線
                </p>
              </div>
            )}

            {nearby.map((item, i) => (
              <NearbyTransportCard
                key={item.id}
                item={item}
                defaultExpanded={i === 0}
                onTapRoute={handleTapEtaRoute}
                onViewStation={handleViewStation}
                isFavorite={isFavorite}
                toggleFavorite={toggleFavorite}
              />
            ))}
          </>
        )}

        {tab === "routes" && (
          <>
            {!routeQuery && !selectedRoute && !heartFocus && (
              <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                喺上面輸入路線編號搜尋
                <br />
                <span className="text-[13px]">支援九巴、城巴、綠Van、港鐵巴士、港鐵、輕鐵</span>
              </div>
            )}

            {heartFocus ? (
              <HeartFocusView heart={heartFocus} onBack={() => setHeartFocus(null)} />
            ) : selectedRoute ? (
              <div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <OperatorBadge operator={selectedRoute.operator} />
                      <span className="font-bold text-slate-900 text-[17px]">
                        {selectedRoute.route}
                      </span>
                      {selectedRoute.directionLabel && (
                        <span className="text-[13px] text-slate-500">
                          {selectedRoute.directionLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] text-slate-500 truncate mt-0.5">
                      {selectedRoute.originTc} → {selectedRoute.destTc}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleFavRoute(selectedRoute)}
                    className="p-2 shrink-0"
                    aria-label="收藏路線"
                  >
                    {isFavRoute(selectedRoute.id) ? (
                      <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
                    ) : (
                      <StarOff className="w-6 h-6 text-slate-300" />
                    )}
                  </button>
                </div>

                {(selectedRoute as any).isStopResult ? (
                  <div className="mt-3">
                    <StopSearchResultETAs stop={(selectedRoute as any).stopData} />
                  </div>
                ) : selectedRoute.operator === "MTRT" ? (
                  <div className="mt-3">
                    <MTRTStationETAs route={selectedRoute} />
                  </div>
                ) : selectedRoute.operator === "LRT" ? (
                  <div className="mt-3">
                    <LRTStationETAs route={selectedRoute} />
                  </div>
                ) : stopsListLoading ? (
                  <div className="bg-white rounded-2xl p-6 mt-3 text-center text-[15px] text-slate-500">
                    載入站表緊…
                  </div>
                ) : (
                  <LiteRouteStopsList
                    route={selectedRoute}
                    stopSeqs={stopSeqs}
                    stops={stops}
                    isHeart={isHeart}
                    onToggleHeart={handleToggleHeart}
                    highlightSeq={highlightSeq}
                  />
                )}
              </div>
            ) : (
              routeQuery && (
                <div className="space-y-2">
                  {routesLoading && (
                    <div className="text-center text-[14px] text-slate-400 py-4">
                      搜尋緊…
                    </div>
                  )}
                  {!routesLoading && sortedRoutes.length === 0 && (
                    <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                      搵唔到「{routeQuery}」
                    </div>
                  )}
                  {sortedRoutes.map((r) => (
                    <div
                      key={r.id}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3"
                    >
                      <button
                        onClick={() => setSelectedRoute(r)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                      >
                        <OperatorBadge operator={r.operator} />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-[17px]">
                            {r.route}
                            {r.directionLabel && (
                              <span className="ml-2 text-[13px] font-medium text-slate-500">
                                {r.directionLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-[14px] text-slate-500 truncate">
                            {r.originTc} → {r.destTc}
                          </div>
                          {r.originEn && (
                            <div className="text-[12px] text-slate-400 truncate">
                              {r.originEn} → {r.destEn}
                            </div>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => toggleFavRoute(r)}
                        className="p-2 shrink-0"
                        aria-label={isFavRoute(r.id) ? "取消收藏" : "收藏路線"}
                      >
                        {isFavRoute(r.id) ? (
                          <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                        ) : (
                          <StarOff className="w-5 h-5 text-slate-300" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}

        {tab === "favorites" && (
          <>
            <div className="flex p-1 bg-white rounded-2xl border border-slate-100">
              {(["hearts", "routes", "stops"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setFavTab(t); setEditOrder(false); }}
                  className={clsx(
                    "flex-1 py-2 text-[14px] font-medium rounded-xl transition-all flex items-center justify-center gap-1",
                    favTab === t
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500"
                  )}
                >
                  {t === "hearts" ? (
                    <><Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" /> 心心 ({hearts.length})</>
                  ) : t === "routes" ? (
                    <>★ 路線 ({favRoutes.length})</>
                  ) : (
                    <>★ 車站 ({favorites.length})</>
                  )}
                </button>
              ))}
            </div>
            {favTab === "hearts" && hearts.length > 1 && (
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setEditOrder(!editOrder)}
                  className={editOrder
                    ? "text-[14px] font-medium px-3 py-1.5 rounded-full bg-sky-600 text-white"
                    : "text-[14px] font-medium px-3 py-1.5 rounded-full bg-white text-sky-600 border border-sky-200"}
                >
                  {editOrder ? "✓ 完成排序" : "✎ 編輯次序"}
                </button>
              </div>
            )}

            {favTab === "hearts" && (
              <div className="space-y-2">
                {hearts.length === 0 && (
                  <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                    未有心水站
                    <br />
                    <span className="text-[13px]">入去任何路線嘅站表，撳每站右邊嘅 ♡ 收藏你成日上車嗰個站</span>
                  </div>
                )}
                {hearts.map((h, idx) => (
                  <HeartListItem
                    key={h.id}
                    heart={h}
                    index={idx}
                    total={hearts.length}
                    editOrder={editOrder}
                    onTap={() => handleTapHeart(h)}
                    onRemove={() => removeHeart(h.id)}
                    onMove={(dir) => moveHeart(h.id, dir)}
                  />
                ))}
              </div>
            )}

            {favTab === "routes" && (
              <div className="space-y-2">
                {favRoutes.length === 0 && (
                  <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                    未收藏任何路線
                    <br />
                    <span className="text-[13px]">去「路線」搜尋，撳星號收藏</span>
                  </div>
                )}
                {favRoutes.map((fr) => (
                  <div
                    key={fr.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3"
                  >
                    <button
                      onClick={() => handleSelectFavRoute(fr)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                    >
                      <OperatorBadge operator={fr.operator} />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-[17px]">
                          {fr.route}
                          {fr.directionLabel && (
                            <span className="ml-2 text-[13px] font-medium text-slate-500">
                              {fr.directionLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-[14px] text-slate-500 truncate">
                          {fr.originTc} → {fr.destTc}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => removeFavRoute(fr.id)}
                      className="p-2 shrink-0"
                      aria-label="取消收藏"
                    >
                      <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {favTab === "stops" && (
              <div className="space-y-2">
                {favorites.length === 0 && (
                  <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
                    未收藏任何車站
                  </div>
                )}
                {favorites.map((f) => {
                  const fullStop: BusStop = {
                    id: f.id,
                    originalIds: [],
                    nameEn: f.nameEn,
                    nameTc: f.nameTc,
                    lat: f.lat,
                    lng: f.lng,
                  };
                  return (
                    <NearbyStopCard
                      key={f.id}
                      stop={fullStop}
                      distance={0}
                      isFavorite={isFavorite}
                      toggleFavorite={toggleFavorite}
                      defaultExpanded={false}
                      onTapRoute={handleTapEtaRoute}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* footer: link to map version */}
      <footer className="shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between">
        <span className="text-[12px] text-slate-400">HK Bus ETA · 極速版</span>
      </footer>
    </main>
  );
}