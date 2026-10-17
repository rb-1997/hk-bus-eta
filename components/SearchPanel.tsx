"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Search,
  MapPin,
  Star,
  StarOff,
  X,
  Clock,
  RefreshCw,
  LocateFixed,
  Heart,
} from "lucide-react";
import type { BusStop, ETA, BusRoute, FavoriteStop, FavoriteRoute, PathStopMarker, RouteStopSeq } from "@/types/bus";
import { useETA, useRouteSearch, useRouteStops } from "@/hooks/useBusData";
import { useFavoriteHearts } from "@/hooks/useFavoriteHearts";
import { useRoutesSortedByDistance } from "@/hooks/useRoutesSortedByDistance";
import { findClosestStops, haversineDistance } from "@/utils/geo";
import clsx from "clsx";

interface SearchPanelProps {
  stops: BusStop[];
  selectedStop: BusStop | null;
  onSelectStop: (stop: BusStop | null) => void;
  selectedRoute: BusRoute | null;
  onSelectRoute: (route: BusRoute | null) => void;
  userLat: number;
  userLng: number;
  onLocate: () => void;
  locating: boolean;
  favorites: FavoriteStop[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (stop: BusStop) => void;
  favRoutes: FavoriteRoute[];
  isFavRoute: (id: string) => boolean;
  toggleFavRoute: (route: BusRoute) => void;
  removeFavRoute: (id: string) => void;
  onSelectFavRoute: (fr: FavoriteRoute) => void;
  onShowRoutePath: (
    path: { lat: number; lng: number }[] | null,
    route: BusRoute | null,
    pathStops?: PathStopMarker[] | null
  ) => void;  className?: string;
  isMobileSheet?: boolean;
  sheetExpanded?: boolean;
  onToggleSheet?: () => void;
}

function OperatorBadge({ operator }: { operator: string }) {
  if (operator === "KMB" || operator === "LWB") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-red-500 text-white shadow-sm">
        KMB
      </span>
    );
  }
  if (operator === "GMB") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-emerald-600 text-white shadow-sm">
        小巴
      </span>
    );
  }
  if (operator === "MTR") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-[#c0392b] text-white shadow-sm">
        港鐵
      </span>
    );
  }
  if (operator === "MTRT") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-[#8e44ad] text-white shadow-sm">
        鐵路
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-blue-600 text-white shadow-sm">
      CTB
    </span>
  );
}

function ETAItem({ eta, onTapRoute }: { eta: ETA; onTapRoute?: (eta: ETA) => void }) {
  const mins = eta.etaMinutes;
  let timeLabel = "—";
  let timeClass = "text-slate-400";
  let bgClass = "bg-slate-50";
  const urgent = mins !== null && mins <= 3 && mins >= 0;

  if (mins !== null) {
    if (mins <= 0) {
      timeLabel = "Now";
      timeClass = "text-emerald-600";
      bgClass = "bg-emerald-50";
    } else if (mins === 1) {
      timeLabel = "1 min";
      timeClass = "text-emerald-600";
      bgClass = "bg-emerald-50";
    } else if (mins <= 5) {
      timeLabel = `${mins} min`;
      timeClass = "text-amber-600";
      bgClass = "bg-amber-50";
    } else {
      timeLabel = `${mins} min`;
      timeClass = "text-slate-700";
      bgClass = "bg-slate-50";
    }
  } else if (eta.remarkEn) {
    timeLabel = eta.remarkEn.slice(0, 18);
  }

  return (
    <div className="flex items-center justify-between py-3.5 px-1 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <OperatorBadge operator={eta.operator} />
        <div className="min-w-0">
          {onTapRoute ? (
            <button
              onClick={() => onTapRoute(eta)}
              className="font-semibold text-sky-700 text-[15px] tracking-tight underline decoration-sky-200 underline-offset-2 active:text-sky-800"
            >
              {eta.route}
            </button>
          ) : (
            <div className="font-semibold text-slate-900 text-[15px] tracking-tight">
              {eta.route}
            </div>
          )}
          <div className="text-[13px] text-slate-500 truncate mt-0.5">
            {eta.destTc ? `${eta.destTc} · ` : ""}to {eta.destEn}
          </div>
        </div>
      </div>
      <div
        className={clsx(
          "text-right text-[15px] font-semibold tabular-nums shrink-0 ml-3 px-2.5 py-1 rounded-lg",
          timeClass,
          bgClass,
          urgent && "eta-urgent"
        )}
      >
        {timeLabel}
      </div>
    </div>
  );
}

// One row in the route stops list: stop name + live ETA for this route
function RouteStopRow({
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
      ? (["route-stop-eta-gmb", gmbMeta.route_id, gmbMeta.route_seq, seq] as const)
      : route.operator === "KMB" && kmbStopId
        ? (["route-stop-eta-kmb", kmbStopId, route.route] as const)
        : route.operator === "CTB" && ctbStopId
          ? (["route-stop-eta-ctb", ctbStopId, route.route] as const)
          : route.operator === "MTR" && mtrMeta
            ? (["route-stop-eta-mtr", mtrMeta.routeName, mtrMeta.stopId] as const)
            : null,
    async (key: readonly [string, ...unknown[]]) => {
      if (key[0] === "route-stop-eta-gmb" && gmbMeta) {
        const { getETAs } = await import("@/utils/static-api");
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
      } else if (key[0] === "route-stop-eta-kmb" && kmbStopId) {
        const { getETAs } = await import("@/utils/static-api");
        const all = await getETAs({ operator: "KMB", originalId: kmbStopId });
        return all.filter((e) => e.route === route.route).slice(0, 3);
      } else if (key[0] === "route-stop-eta-ctb" && ctbStopId) {
        const { getETAs } = await import("@/utils/static-api");
        return getETAs({ operator: "CTB", originalId: ctbStopId, routes: route.route });
      } else if (key[0] === "route-stop-eta-mtr" && mtrMeta) {
        const { getETAs } = await import("@/utils/static-api");
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

  // For CTB: fetch stop name if not already known (CTB stops aren't in the global list)
  const { data: ctbName } = useSWR(
    route.operator === "CTB" && ctbStopId && !nameTc
      ? (["ctb-stop-name", ctbStopId] as const)
      : null,
    async () => {
      const { normalizeCTBStop } = await import("@/utils/api");
      const res = await fetch(`https://rt.data.gov.hk/v2/transport/citybus/stop/${ctbStopId}`).then((r) => r.json()).catch(() => null);
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
      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-[12px] font-semibold flex items-center justify-center shrink-0 tabular-nums">
        {seq}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-slate-900 truncate">
          {displayTc || displayEn || `Stop ${seq}`}
        </div>
        {displayTc && displayEn && displayTc !== displayEn && (
          <div className="text-[12px] text-slate-400 truncate">{displayEn}</div>
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
          <span className="text-[12px] text-slate-300">…</span>
        ) : list.length === 0 ? (
          <span className="text-[12px] text-slate-300">—</span>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            {list.map((e, i) => (
              <span
                key={i}
                className={clsx(
                  "text-[13px] font-semibold tabular-nums",
                  e.etaMinutes !== null && e.etaMinutes <= 1
                    ? "text-emerald-600"
                    : e.etaMinutes !== null && e.etaMinutes <= 5
                      ? "text-amber-600"
                      : "text-slate-700",
                  e.etaMinutes !== null && e.etaMinutes <= 3 && e.etaMinutes >= 0 && "eta-urgent"
                )}
              >
                {e.etaMinutes === null ? (e.remarkTc || e.remarkEn || "—") : e.etaMinutes <= 0 ? "Now" : `${e.etaMinutes} min`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Full route stops list with live ETAs, shown when a route is selected
function RouteStopsList({
  route,
  stopSeqs,
  stops,
  isHeart,
  onToggleHeart,
}: {
  route: BusRoute;
  stopSeqs: RouteStopSeq[];
  stops: BusStop[];
  isHeart?: (route: BusRoute, seq: number) => boolean;
  onToggleHeart?: (route: BusRoute, seq: number, nameTc?: string, nameEn?: string) => void;
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
            mtrMeta: route.operator === "MTR"
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
      <div className="px-4 py-2.5 bg-slate-50 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
        {route.route} · {enriched.length} 個站 · 即時到站
      </div>
      <div className="px-3 max-h-[45vh] overflow-y-auto overscroll-contain">
        {enriched.map((s) => (
          <RouteStopRow
            key={s.seq}
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
        ))}
      </div>
    </div>
  );
}

export default function SearchPanel({
  stops,
  selectedStop,
  onSelectStop,
  selectedRoute,
  onSelectRoute,
  userLat,
  userLng,
  onLocate,
  locating,
  favorites,
  isFavorite,
  toggleFavorite,
  favRoutes,
  isFavRoute,
  toggleFavRoute,
  removeFavRoute,
  onSelectFavRoute,
  onShowRoutePath,
  className = "",
  isMobileSheet = false,
  sheetExpanded = true,
  onToggleSheet,
}: SearchPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [routeQuery, setRouteQuery] = useState("");
  const [mode, setMode] = useState<"stops" | "routes" | "favorites">("stops");
  const [favTab, setFavTab] = useState<"hearts" | "routes" | "stops">("hearts");
  const [countdown, setCountdown] = useState(60);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useSWRConfig();
  const { hearts, isHeart, toggleHeart, removeHeart } = useFavoriteHearts();

  const {
    etas,
    isLoading: etaLoading,
    isValidating,
    error: etaError,
    refresh: refreshETA,
  } = useETA(selectedStop);

  const { routes: searchedRoutes, isLoading: routesLoading } = useRouteSearch(routeQuery);
  const sortedRoutes = useRoutesSortedByDistance(searchedRoutes, userLat, userLng);
  const setSelectedRoute = onSelectRoute;

  const operatorForApi =
    selectedRoute?.operator === "LWB"
      ? "KMB"
      : selectedRoute?.operator === "MTRT" || selectedRoute?.operator === "LRT"
        ? null
        : (selectedRoute?.operator ?? null);

  const { stopSeqs } = useRouteStops(
    selectedRoute?.route || null,
    operatorForApi,
    selectedRoute?.bound || "O",
    selectedRoute?.gmb
  );

  // Auto-refresh ETA countdown (5s tick to avoid re-rendering panel every second)
  useEffect(() => {
    if (!selectedStop) {
      setCountdown(60);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 5) {
          refreshETA();
          return 60;
        }
        return c - 5;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedStop, refreshETA]);

  useEffect(() => {
    const isGmb = selectedRoute?.operator === "GMB";
    if (selectedRoute && stopSeqs.length > 0 && (stops.length > 0 || isGmb)) {
      const byOrig = new Map<string, BusStop>();
      stops.forEach((s) => {
        s.originalIds.forEach((o) => byOrig.set(o.id, s));
        byOrig.set(s.id, s);
      });

      const path: { lat: number; lng: number }[] = [];
      const pathStops: PathStopMarker[] = [];
      stopSeqs
        .sort((a, b) => a.seq - b.seq)
        .forEach((ss) => {
          if (ss.lat != null && ss.lng != null) {
            // GMB: coords embedded in the bundled dataset
            path.push({ lat: ss.lat, lng: ss.lng });
            pathStops.push({
              lat: ss.lat,
              lng: ss.lng,
              seq: ss.seq,
              name_tc: ss.name_tc,
              name_en: ss.name_en,
              gmb: selectedRoute.gmb
                ? {
                    route_id: selectedRoute.gmb.route_id,
                    route_seq: selectedRoute.gmb.route_seq,
                    stop_seq: ss.seq,
                    code: selectedRoute.gmb.code,
                    dest_tc: selectedRoute.destTc,
                    dest_en: selectedRoute.destEn,
                  }
                : undefined,
            });
          } else {
            const found = byOrig.get(ss.stop);
            if (found) path.push({ lat: found.lat, lng: found.lng });
          }
        });

      if (path.length > 1) {
        onShowRoutePath(path, selectedRoute, isGmb ? pathStops : null);
      }
    } else if (!selectedRoute) {
      onShowRoutePath(null, null);
    }
  }, [selectedRoute, stopSeqs, stops, onShowRoutePath]);

  const closest = useMemo(() => {
    if (!userLat || !userLng || stops.length === 0) return [];
    return findClosestStops(stops, userLat, userLng, 20);
  }, [stops, userLat, userLng]);

  const filteredStops = useMemo(() => {
    if (!searchText.trim()) return closest;
    const q = searchText.toLowerCase();
    return stops
      .filter(
        (s) =>
          s.nameEn.toLowerCase().includes(q) ||
          s.nameTc.includes(searchText) ||
          s.id.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [searchText, stops, closest]);

  const handleSelectStop = (stop: BusStop) => {
    onSelectStop(stop);
    // Keep GMB route path visible when tapping its own stops
    if (!stop.id.startsWith("gmb-")) {
      setSelectedRoute(null);
    }
    setMode("stops");
    if (isMobileSheet && onToggleSheet && !sheetExpanded) onToggleSheet();
  };

  const handleSelectRoute = (route: BusRoute) => {
    setSelectedRoute(route);
    setRouteQuery(route.route);
  };

  // Tap a route in the stop ETA list -> jump to its full route view (path + stops)
  const handleTapEtaRoute = async (eta: ETA) => {
    try {
      const { searchRoutes } = await import("@/utils/static-api");
      const candidates = await searchRoutes(eta.route);
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
        setSelectedRoute(best);
        setRouteQuery(best.route);
        setMode("routes");
      }
    } catch {
      /* ignore */
    }
  };

  // Heart: toggle a specific stop on the current route as "心水站"
  const handleToggleHeart = (route: BusRoute, seq: number, nameTc?: string, nameEn?: string) => {
    toggleHeart({ route, stopSeq: seq, stopNameTc: nameTc || "", stopNameEn: nameEn || "" });
  };

  // Tap a heart favorite -> jump to that route's stop list
  const handleTapHeart = (h: import("@/types/bus").FavoriteRouteStop) => {
    const br: BusRoute = {
      id: h.routeId,
      route: h.route,
      operator: h.operator,
      originTc: h.originTc,
      originEn: h.originEn,
      destTc: h.destTc,
      destEn: h.destEn,
      directionLabel: h.directionLabel,
      bound: h.bound,
      gmb: h.gmb,
    };
    setSelectedRoute(br);
    setRouteQuery(br.route);
    setMode("routes");
  };

  return (
    <div className={clsx("flex flex-col h-full bg-white", className)}>
      {isMobileSheet && (
        <div
          className="flex items-center justify-center pt-3 pb-1 cursor-pointer shrink-0"
          onClick={onToggleSheet}
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300" />
        </div>
      )}

      <div className="px-4 pt-3 pb-3 shrink-0 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={onLocate}
            disabled={locating}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-sky-500 text-white shadow-md shadow-sky-500/25 hover:bg-sky-600 active:scale-95 transition disabled:opacity-60 shrink-0"
            aria-label="Locate me"
          >
            <LocateFixed className={clsx("w-5 h-5", locating && "animate-pulse")} />
          </button>

          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder={
                mode === "routes" ? "Route number e.g. 101" : "Search stop or street..."
              }
              value={mode === "routes" ? routeQuery : searchText}
              onChange={(e) =>
                mode === "routes"
                  ? setRouteQuery(e.target.value)
                  : setSearchText(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") inputRef.current?.blur();
              }}
              className="w-full h-11 pl-10 pr-10 rounded-2xl bg-slate-100 border-0 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition"
            />
            {(searchText || routeQuery) && (
              <button
                onClick={() => {
                  setSearchText("");
                  setRouteQuery("");
                  setSelectedRoute(null);
                  onShowRoutePath(null, null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => {
              inputRef.current?.blur();
              if (mode !== "routes") setMode("routes");
            }}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-sky-500 active:text-white active:scale-95 transition shrink-0"
            aria-label="搜尋"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              mutate(() => true);
              refreshETA();
            }}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-sky-500 active:text-white active:scale-95 transition shrink-0"
            aria-label="重新整理"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-2xl">
          {(["stops", "routes", "favorites"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                if (m !== "routes") {
                  setSelectedRoute(null);
                  onShowRoutePath(null, null);
                }
              }}
              className={clsx(
                "flex-1 py-2 text-[13px] font-medium rounded-xl capitalize transition-all",
                mode === m
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {m === "favorites" ? `★ ${favorites.length + favRoutes.length + hearts.length}` : m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        {selectedStop && (
          <div className="mb-4">
            <div className="bg-slate-50 rounded-2xl p-4 mb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900 text-[17px] leading-snug tracking-tight truncate">
                    {selectedStop.nameTc || selectedStop.nameEn}
                  </h2>
                  <p className="text-[13px] text-slate-500 mt-0.5 truncate">
                    {selectedStop.nameEn}
                  </p>
                  {selectedStop.isMerged && (
                    <span className="inline-block mt-2 text-[11px] font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                      Merged stop
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleFavorite(selectedStop)}
                    className="p-2 rounded-xl hover:bg-white transition"
                    aria-label="Toggle favorite"
                  >
                    {isFavorite(selectedStop.id) ? (
                      <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ) : (
                      <StarOff className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                  <button
                    onClick={() => onSelectStop(null)}
                    className="p-2 rounded-xl hover:bg-white transition"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="mt-3.5 flex items-center justify-between text-[12px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Refresh in {countdown}s</span>
                </div>
                <button
                  onClick={() => {
                    refreshETA();
                    setCountdown(60);
                  }}
                  disabled={isValidating}
                  className="flex items-center gap-1.5 font-medium text-sky-600 hover:text-sky-700 disabled:opacity-50"
                >
                  <RefreshCw
                    className={clsx("w-3.5 h-3.5", isValidating && "animate-spin")}
                  />
                  Refresh
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {etaError && (
                <div className="m-3 p-3 bg-red-50 text-red-600 text-[13px] rounded-xl">
                  {etaError}
                </div>
              )}
              {etaLoading && etas.length === 0 ? (
                <div className="py-12 text-center text-[14px] text-slate-400">
                  Loading arrivals...
                </div>
              ) : etas.length === 0 ? (
                <div className="py-10 text-center text-[14px] text-slate-400 px-4">
                  No real-time data for this stop.
                  <br />
                  <span className="text-[12px]">Try searching a route number.</span>
                </div>
              ) : (
                <div className="px-4">
                  {etas.map((eta) => (
                    <ETAItem key={eta.id} eta={eta} onTapRoute={handleTapEtaRoute} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "stops" && !selectedStop && (
          <div>
            <p className="px-1 py-2 text-[12px] font-medium text-slate-400 uppercase tracking-wider">
              {searchText ? "Results" : "Nearby stops"}
            </p>
            {filteredStops.length === 0 ? (
              <div className="py-14 text-center text-[14px] text-slate-400">
                {stops.length === 0 ? "Loading stops..." : "No stops found"}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredStops.map((stop) => {
                  const dist =
                    userLat && userLng
                      ? Math.round(haversineDistance(userLat, userLng, stop.lat, stop.lng))
                      : null;
                  return (
                    <button
                      key={stop.id}
                      onClick={() => handleSelectStop(stop)}
                      className="w-full text-left px-3.5 py-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 flex items-center gap-3.5 transition"
                    >
                      <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                        <MapPin className="w-4.5 h-4.5 text-sky-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium text-slate-900 truncate">
                          {stop.nameTc || stop.nameEn}
                        </div>
                        <div className="text-[13px] text-slate-500 truncate mt-0.5">
                          {stop.nameEn}
                        </div>
                      </div>
                      {dist !== null && (
                        <span className="text-[12px] font-medium text-slate-400 tabular-nums shrink-0">
                          {dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mode === "routes" && (
          <div>
            <p className="px-1 py-2 text-[12px] font-medium text-slate-400 uppercase tracking-wider">
              Route search
            </p>
            {routesLoading ? (
              <div className="py-14 text-center text-[14px] text-slate-400">
                Searching...
              </div>
            ) : sortedRoutes.length === 0 && routeQuery ? (
              <div className="py-14 text-center text-[14px] text-slate-400">
                No routes found
              </div>
            ) : (
              <div className="space-y-1">
                {sortedRoutes.map((r) => (
                  <div
                    key={r.id}
                    className={clsx(
                      "w-full px-3.5 py-3.5 rounded-2xl flex items-center gap-3.5 transition",
                      selectedRoute?.id === r.id
                        ? "bg-sky-50 ring-1 ring-sky-200"
                        : "hover:bg-slate-50"
                    )}
                  >
                    <button
                      onClick={() => handleSelectRoute(r)}
                      className="flex items-center gap-3.5 min-w-0 flex-1 text-left"
                    >
                      <OperatorBadge operator={r.operator} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold text-slate-900">
                          {r.route}
                          {r.directionLabel && (
                            <span className="ml-2 text-[12px] font-normal text-slate-500">
                              {r.directionLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] text-slate-500 truncate mt-0.5">
                          {r.originTc || r.originEn} → {r.destTc || r.destEn}
                        </div>
                        {(r.originEn || r.destEn) && (r.originTc || r.destTc) && (
                          <div className="text-[12px] text-slate-400 truncate">
                            {r.originEn} → {r.destEn}
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavRoute(r);
                      }}
                      className="shrink-0 p-1.5 -m-1.5"
                      aria-label={isFavRoute(r.id) ? "Remove from favorites" : "Add to favorites"}
                    >
                      {isFavRoute(r.id) ? (
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                      ) : (
                        <Star className="w-5 h-5 text-slate-300" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selectedRoute && (
              <div className="mt-4 p-3.5 bg-sky-50 rounded-2xl text-[13px] text-sky-800 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFavRoute(selectedRoute)}
                    className="shrink-0"
                    aria-label={isFavRoute(selectedRoute.id) ? "Remove from favorites" : "Add to favorites"}
                  >
                    {isFavRoute(selectedRoute.id) ? (
                      <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ) : (
                      <Star className="w-5 h-5 text-slate-300" />
                    )}
                  </button>
                  <span>
                    Showing path for <strong>{selectedRoute.route}</strong>
                  </span>
                </span>
                <button
                  onClick={() => {
                    setSelectedRoute(null);
                    onShowRoutePath(null, null);
                  }}
                  className="font-medium underline"
                >
                  Clear
                </button>
              </div>
            )}
            {selectedRoute && stopSeqs.length > 0 && (
              <RouteStopsList
                route={selectedRoute}
                stopSeqs={stopSeqs}
                stops={stops}
                isHeart={isHeart}
                onToggleHeart={handleToggleHeart}
              />
            )}
          </div>
        )}

        {mode === "favorites" && (
          <div>
            {/* Sub-tabs: Hearts | Routes | Stops */}
            <div className="flex gap-2 px-1 py-2">
              <button
                onClick={() => setFavTab("hearts")}
                className={clsx(
                  "flex-1 py-2 rounded-xl text-[13px] font-medium transition flex items-center justify-center gap-1",
                  favTab === "hearts"
                    ? "bg-rose-500 text-white"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                <Heart className={clsx("w-3.5 h-3.5", favTab === "hearts" ? "fill-white" : "text-rose-400")} />
                心心 ({hearts.length})
              </button>
              <button
                onClick={() => setFavTab("routes")}
                className={clsx(
                  "flex-1 py-2 rounded-xl text-[13px] font-medium transition",
                  favTab === "routes"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                ★ 路線 ({favRoutes.length})
              </button>
              <button
                onClick={() => setFavTab("stops")}
                className={clsx(
                  "flex-1 py-2 rounded-xl text-[13px] font-medium transition",
                  favTab === "stops"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                ★ 車站 ({favorites.length})
              </button>
            </div>
            {favTab === "hearts" ? (
              hearts.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-7 h-7 text-rose-300" />
                  </div>
                  <p className="text-[15px] text-slate-500">未有心水站</p>
                  <p className="text-[13px] text-slate-400 mt-1">
                    入去任何路線嘅站表，撳每站右邊嘅 ♡
                  </p>
                </div>
              ) : (
                <div className="space-y-2 px-1">
                  {hearts.map((h) => (
                    <div
                      key={h.id}
                      className="bg-white rounded-2xl border border-rose-100 shadow-sm px-4 py-3 flex items-center gap-3"
                    >
                      <button
                        onClick={() => handleTapHeart(h)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                      >
                        <Heart className="w-5 h-5 text-rose-500 fill-rose-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-[15px]">
                            {h.route}
                            <span className="ml-2 text-[12px] font-medium text-slate-500">
                              第 {h.stopSeq} 站 · {h.stopNameTc || h.stopNameEn}
                            </span>
                          </div>
                          <div className="text-[13px] text-slate-500 truncate">
                            往 {h.destTc || h.destEn}
                            {h.directionLabel && ` · ${h.directionLabel}`}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => removeHeart(h.id)}
                        className="p-2 shrink-0"
                        aria-label="取消心水站"
                      >
                        <X className="w-4 h-4 text-slate-300" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : favTab === "routes" ? (
              favRoutes.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Star className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-[15px] text-slate-500">No favorite routes yet</p>
                  <p className="text-[13px] text-slate-400 mt-1">
                    Tap the star on any route to save it
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {favRoutes.map((fr) => (
                    <div
                      key={fr.id}
                      className="w-full px-3.5 py-3.5 rounded-2xl hover:bg-slate-50 flex items-center gap-3.5 transition"
                    >
                      <button
                        onClick={() => {
                          onSelectFavRoute(fr);
                          setMode("routes");
                        }}
                        className="flex items-center gap-3.5 min-w-0 flex-1 text-left"
                      >
                        <OperatorBadge operator={fr.operator} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[15px] font-semibold text-slate-900">
                            {fr.route}
                            {fr.directionLabel && (
                              <span className="ml-2 text-[12px] font-normal text-slate-500">
                                {fr.directionLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-[13px] text-slate-500 truncate mt-0.5">
                            {fr.originTc || fr.originEn} → {fr.destTc || fr.destEn}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => removeFavRoute(fr.id)}
                        className="shrink-0 p-1.5 -m-1.5"
                        aria-label="Remove from favorites"
                      >
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : favorites.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Star className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-[15px] text-slate-500">No favorites yet</p>
                <p className="text-[13px] text-slate-400 mt-1">
                  Tap the star on any stop to save it
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {favorites.map((fav) => {
                  const full = stops.find((s) => s.id === fav.id) || {
                    id: fav.id,
                    nameEn: fav.nameEn,
                    nameTc: fav.nameTc,
                    lat: fav.lat,
                    lng: fav.lng,
                    originalIds: [],
                  };
                  return (
                    <button
                      key={fav.id}
                      onClick={() => handleSelectStop(full as BusStop)}
                      className="w-full text-left px-3.5 py-3.5 rounded-2xl hover:bg-slate-50 flex items-center gap-3.5 transition"
                    >
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                        <Star className="w-4.5 h-4.5 text-amber-400 fill-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium text-slate-900 truncate">
                          {fav.nameTc || fav.nameEn}
                        </div>
                        <div className="text-[13px] text-slate-500 truncate mt-0.5">
                          {fav.nameEn}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-100 text-[11px] text-slate-400 text-center shrink-0 safe-bottom">
        Data from DATA.GOV.HK · KMB & Citybus · 綠Van
      </div>
    </div>
  );
}
