"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, MapPin, Star, StarOff, X, Clock, RefreshCw, Bus, LocateFixed, ChevronDown, ChevronUp } from "lucide-react";
import type { BusStop, ETA, BusRoute, FavoriteStop } from "@/types/bus";
import { useETA, useRouteSearch, useRouteStops } from "@/hooks/useBusData";
import { findClosestStops, haversineDistance } from "@/utils/geo";
import clsx from "clsx";

interface SearchPanelProps {
  stops: BusStop[];
  selectedStop: BusStop | null;
  onSelectStop: (stop: BusStop | null) => void;
  userLat: number;
  userLng: number;
  onLocate: () => void;
  locating: boolean;
  favorites: FavoriteStop[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (stop: BusStop) => void;
  onShowRoutePath: (path: { lat: number; lng: number }[] | null, route: BusRoute | null) => void;
  className?: string;
  isMobileSheet?: boolean;
  sheetExpanded?: boolean;
  onToggleSheet?: () => void;
}

function OperatorBadge({ operator }: { operator: string }) {
  if (operator === "KMB" || operator === "LWB") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">
        KMB
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-700 text-white">
      CTB
    </span>
  );
}

function ETAItem({ eta }: { eta: ETA }) {
  const mins = eta.etaMinutes;
  let timeLabel = "—";
  let timeClass = "text-gray-400";
  if (mins !== null) {
    if (mins <= 0) {
      timeLabel = "Arriving";
      timeClass = "text-green-600 font-semibold";
    } else if (mins === 1) {
      timeLabel = "1 min";
      timeClass = "text-green-600 font-semibold";
    } else {
      timeLabel = `${mins} min`;
      timeClass = mins <= 5 ? "text-amber-600 font-medium" : "text-gray-800";
    }
  } else if (eta.remarkEn) {
    timeLabel = eta.remarkEn.slice(0, 20);
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <OperatorBadge operator={eta.operator} />
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 text-sm truncate">
            {eta.route}
          </div>
          <div className="text-xs text-gray-500 truncate">
            to {eta.destEn}
          </div>
        </div>
      </div>
      <div className={clsx("text-right text-sm tabular-nums shrink-0 ml-2", timeClass)}>
        {timeLabel}
      </div>
    </div>
  );
}

export default function SearchPanel({
  stops,
  selectedStop,
  onSelectStop,
  userLat,
  userLng,
  onLocate,
  locating,
  favorites,
  isFavorite,
  toggleFavorite,
  onShowRoutePath,
  className = "",
  isMobileSheet = false,
  sheetExpanded = true,
  onToggleSheet,
}: SearchPanelProps) {
  const [searchText, setSearchText] = useState("");
  const [routeQuery, setRouteQuery] = useState("");
  const [mode, setMode] = useState<"stops" | "routes" | "favorites">("stops");
  const [countdown, setCountdown] = useState(60);
  const inputRef = useRef<HTMLInputElement>(null);

  const { etas, isLoading: etaLoading, isValidating, error: etaError, refresh: refreshETA, timestamp } = useETA(selectedStop);
  const { routes: searchedRoutes, isLoading: routesLoading } = useRouteSearch(routeQuery);
  const [selectedRoute, setSelectedRoute] = useState<BusRoute | null>(null);
  // LWB uses the same KMB API endpoints
  const operatorForApi =
    selectedRoute?.operator === "LWB" ? "KMB" : selectedRoute?.operator ?? null;

  const { stopSeqs } = useRouteStops(
    selectedRoute?.route || null,
    operatorForApi,
    selectedRoute?.bound || "O"
  );

  // Countdown timer for auto refresh
  useEffect(() => {
    if (!selectedStop) {
      setCountdown(60);
      return;
    }
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          refreshETA();
          return 60;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedStop, refreshETA]);

  // When route stops loaded, map them to coords from stops list and draw
  useEffect(() => {
    if (selectedRoute && stopSeqs.length > 0 && stops.length > 0) {
      const path: { lat: number; lng: number }[] = [];
      const stopMap = new Map(stops.map((s) => {
        // match original id
        for (const o of s.originalIds) {
          return [o.id, s] as const; // rough, better later
        }
        return [s.id, s] as const;
      }));
      // Better matching
      const byOrig = new Map<string, BusStop>();
      stops.forEach((s) => {
        s.originalIds.forEach((o) => byOrig.set(o.id, s));
        byOrig.set(s.id, s);
      });

      stopSeqs
        .sort((a, b) => a.seq - b.seq)
        .forEach((ss) => {
          const found = byOrig.get(ss.stop);
          if (found) path.push({ lat: found.lat, lng: found.lng });
        });
      if (path.length > 1) {
        onShowRoutePath(path, selectedRoute);
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
    setSelectedRoute(null);
    setMode("stops");
    if (isMobileSheet && onToggleSheet && !sheetExpanded) onToggleSheet();
  };

  const handleSelectRoute = (route: BusRoute) => {
    setSelectedRoute(route);
    setRouteQuery(route.route);
    // Clear stop selection for pure route view
    // onSelectStop(null);
  };

  return (
    <div className={clsx("flex flex-col bg-white h-full overflow-hidden", className)}>
      {/* Header / drag handle for mobile */}
      {isMobileSheet && (
        <div
          className="flex items-center justify-center py-2 cursor-pointer border-b border-gray-100 shrink-0"
          onClick={onToggleSheet}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
          {sheetExpanded ? (
            <ChevronDown className="w-4 h-4 ml-2 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 ml-2 text-gray-400" />
          )}
        </div>
      )}

      {/* Top controls */}
      <div className="p-3 border-b border-gray-100 shrink-0 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={onLocate}
            disabled={locating}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-60 active:scale-95 transition shrink-0"
          >
            <LocateFixed className={clsx("w-4 h-4", locating && "animate-pulse")} />
            <span className="hidden sm:inline">Locate Me</span>
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder={mode === "routes" ? "Route no. e.g. 101" : "Search street or building..."}
              value={mode === "routes" ? routeQuery : searchText}
              onChange={(e) =>
                mode === "routes" ? setRouteQuery(e.target.value) : setSearchText(e.target.value)
              }
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {(searchText || routeQuery) && (
              <button
                onClick={() => {
                  setSearchText("");
                  setRouteQuery("");
                  setSelectedRoute(null);
                  onShowRoutePath(null, null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
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
                "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition",
                mode === m
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {m === "favorites" ? `★ ${favorites.length}` : m}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Selected stop ETA view */}
        {selectedStop && mode === "stops" && (
          <div className="border-b border-gray-100">
            <div className="p-3 bg-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 text-base leading-tight truncate">
                    {selectedStop.nameEn}
                  </h2>
                  <p className="text-sm text-gray-500 truncate">{selectedStop.nameTc}</p>
                  {selectedStop.isMerged && (
                    <span className="inline-block mt-1 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                      Merged stop
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleFavorite(selectedStop)}
                    className="p-1.5 rounded-full hover:bg-gray-200"
                    aria-label="Toggle favorite"
                  >
                    {isFavorite(selectedStop.id) ? (
                      <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                    ) : (
                      <StarOff className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  <button
                    onClick={() => onSelectStop(null)}
                    className="p-1.5 rounded-full hover:bg-gray-200"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Refresh bar */}
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Auto refresh in {countdown}s</span>
                </div>
                <button
                  onClick={() => {
                    refreshETA();
                    setCountdown(60);
                  }}
                  disabled={isValidating}
                  className="flex items-center gap-1 text-primary-600 hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={clsx("w-3.5 h-3.5", isValidating && "animate-spin")} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="px-3 pb-2">
              {etaError && (
                <div className="my-2 p-2 bg-red-50 text-red-700 text-xs rounded-lg">
                  {etaError}. Try again later.
                </div>
              )}
              {etaLoading && etas.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading ETAs...</div>
              ) : etas.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  No real-time ETA available for this stop.
                  <br />
                  <span className="text-xs">Try searching a route number instead.</span>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {etas.map((eta) => (
                    <ETAItem key={eta.id} eta={eta} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lists */}
        {mode === "stops" && !selectedStop && (
          <div className="p-2">
            <p className="px-2 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
              {searchText ? "Search results" : "Nearby stops"}
            </p>
            {filteredStops.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                {stops.length === 0 ? "Loading stops..." : "No stops found"}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredStops.map((stop) => {
                  const dist =
                    userLat && userLng
                      ? Math.round(haversineDistance(userLat, userLng, stop.lat, stop.lng))
                      : null;
                  return (
                    <li key={stop.id}>
                      <button
                        onClick={() => handleSelectStop(stop)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3"
                      >
                        <MapPin className="w-4 h-4 text-primary-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {stop.nameEn}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{stop.nameTc}</div>
                        </div>
                        {dist !== null && (
                          <span className="text-xs text-gray-400 tabular-nums shrink-0">
                            {dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {mode === "routes" && (
          <div className="p-2">
            <p className="px-2 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
              Route search
            </p>
            {routesLoading ? (
              <div className="py-8 text-center text-sm text-gray-400">Searching...</div>
            ) : searchedRoutes.length === 0 && routeQuery ? (
              <div className="py-8 text-center text-sm text-gray-400">No routes match</div>
            ) : (
              <ul className="space-y-0.5">
                {searchedRoutes.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => handleSelectRoute(r)}
                      className={clsx(
                        "w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3",
                        selectedRoute?.id === r.id
                          ? "bg-primary-50 ring-1 ring-primary-200"
                          : "hover:bg-gray-50"
                      )}
                    >
                      <OperatorBadge operator={r.operator} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {r.route}
                          {r.directionLabel && (
                            <span className="ml-2 text-xs font-normal text-gray-500">
                              {r.directionLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {r.originEn} → {r.destEn}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedRoute && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                Showing path for <strong>{selectedRoute.route}</strong> on map.
                <button
                  onClick={() => {
                    setSelectedRoute(null);
                    onShowRoutePath(null, null);
                  }}
                  className="ml-2 text-primary-600 underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "favorites" && (
          <div className="p-2">
            {favorites.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No favorites yet.
                <br />
                Tap the star on a stop to save it.
              </div>
            ) : (
              <ul className="space-y-0.5">
                {favorites.map((fav) => {
                  // Find full stop if available
                  const full = stops.find((s) => s.id === fav.id) || {
                    id: fav.id,
                    nameEn: fav.nameEn,
                    nameTc: fav.nameTc,
                    lat: fav.lat,
                    lng: fav.lng,
                    originalIds: [],
                  };
                  return (
                    <li key={fav.id}>
                      <button
                        onClick={() => handleSelectStop(full as BusStop)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {fav.nameEn}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{fav.nameTc}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 text-center shrink-0">
        Data from DATA.GOV.HK · KMB & Citybus · Updated every ~1 min
      </div>
    </div>
  );
}