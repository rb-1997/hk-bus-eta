"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useStops } from "@/hooks/useBusData";
import { useFavorites } from "@/hooks/useFavorites";
import SearchPanel from "@/components/SearchPanel";
import type { BusStop, BusRoute } from "@/types/bus";
import { findClosestStops } from "@/utils/geo";
import { AlertCircle } from "lucide-react";

// Dynamic import Map to avoid SSR issues with Leaflet
const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
      Loading map...
    </div>
  ),
});

export default function HomePage() {
  const {
    lat: userLat,
    lng: userLng,
    loading: geoLoading,
    error: geoError,
    permission,
    requestLocation,
  } = useGeolocation(true);

  const { stops, isLoading: stopsLoading, error: stopsError } = useStops();
  const { favorites, isFavorite, toggleFavorite, loaded: favLoaded } = useFavorites();

  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [routePath, setRoutePath] = useState<{ lat: number; lng: number }[] | null>(null);
  const [highlightedRoute, setHighlightedRoute] = useState<BusRoute | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Auto select closest stop on first successful geo + stops
  useEffect(() => {
    if (
      !selectedStop &&
      !geoLoading &&
      permission === "granted" &&
      stops.length > 0 &&
      userLat &&
      userLng
    ) {
      const closest = findClosestStops(stops, userLat, userLng, 1);
      if (closest[0]) {
        // Optional: auto open first, or leave user to click. For better UX leave unselected.
        // setSelectedStop(closest[0]);
      }
    }
  }, [geoLoading, permission, stops, userLat, userLng, selectedStop]);

  const handleSelectStop = useCallback((stop: BusStop | null) => {
    setSelectedStop(stop);
    if (stop) {
      setSheetExpanded(true);
      setRoutePath(null);
      setHighlightedRoute(null);
    }
  }, []);

  const handleShowRoutePath = useCallback(
    (path: { lat: number; lng: number }[] | null, route: BusRoute | null) => {
      setRoutePath(path);
      setHighlightedRoute(route);
    },
    []
  );

  const handleSearchThisArea = useCallback(() => {
    // Already filtered by bounds in Map; just ensure panel shows nearby
    setSelectedStop(null);
    setSheetExpanded(true);
  }, []);

  // Error banner
  useEffect(() => {
    if (stopsError) setGlobalError(stopsError);
    else if (geoError && permission === "denied")
      setGlobalError("Location denied. Showing Hong Kong default center. Use search or pan the map.");
    else setGlobalError(null);
  }, [stopsError, geoError, permission]);

  return (
    <main className="h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden relative">
      {/* Global error banner */}
      {globalError && (
        <div className="absolute top-0 left-0 right-0 z-[2000] bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{globalError}</span>
          <button
            onClick={() => setGlobalError(null)}
            className="text-amber-700 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Map - takes full on mobile, half on desktop */}
      <div className="relative flex-1 min-h-0 md:w-1/2 lg:w-3/5 h-[55vh] md:h-full order-1">
        <Map
          stops={stops}
          selectedStop={selectedStop}
          onSelectStop={handleSelectStop}
          userLat={userLat}
          userLng={userLng}
          onSearchThisArea={handleSearchThisArea}
          routePath={routePath || undefined}
          highlightedRoute={highlightedRoute}
        />

        {/* Loading overlay for stops */}
        {stopsLoading && (
          <div className="absolute inset-0 bg-white/60 z-[500] flex items-center justify-center pointer-events-none">
            <div className="bg-white shadow-lg rounded-xl px-4 py-3 text-sm text-gray-600">
              Loading bus stops...
            </div>
          </div>
        )}
      </div>

      {/* Control panel */}
      {/* Desktop: side panel */}
      <div className="hidden md:flex md:w-1/2 lg:w-2/5 h-full border-l border-gray-200 order-2 flex-col">
        <SearchPanel
          stops={stops}
          selectedStop={selectedStop}
          onSelectStop={handleSelectStop}
          userLat={userLat}
          userLng={userLng}
          onLocate={requestLocation}
          locating={geoLoading}
          favorites={favorites}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          onShowRoutePath={handleShowRoutePath}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={`md:hidden absolute bottom-0 left-0 right-0 z-[1100] bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.12)] transition-all duration-300 ease-out safe-bottom ${
          sheetExpanded ? "h-[52vh]" : "h-[72px]"
        }`}
      >
        <SearchPanel
          stops={stops}
          selectedStop={selectedStop}
          onSelectStop={handleSelectStop}
          userLat={userLat}
          userLng={userLng}
          onLocate={requestLocation}
          locating={geoLoading}
          favorites={favorites}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          onShowRoutePath={handleShowRoutePath}
          isMobileSheet
          sheetExpanded={sheetExpanded}
          onToggleSheet={() => setSheetExpanded((e) => !e)}
        />
      </div>
    </main>
  );
}