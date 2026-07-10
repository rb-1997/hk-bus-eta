"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BusStop, BusRoute } from "@/types/bus";
import { filterStopsInBounds, DEFAULT_HK_CENTER, DEFAULT_ZOOM } from "@/utils/geo";
import { Bus } from "lucide-react";

// Fix default marker icons in Next.js / webpack
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const stopIcon = new L.DivIcon({
  className: "custom-stop-icon",
  html: `<div style="
    background: #0ea5e9;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const selectedIcon = new L.DivIcon({
  className: "custom-selected-icon",
  html: `<div style="
    background: #e11d48;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const userIcon = new L.DivIcon({
  className: "user-location-icon",
  html: `<div style="
    background: #3b82f6;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 0 0 6px rgba(59,130,246,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface MapProps {
  stops: BusStop[];
  selectedStop: BusStop | null;
  onSelectStop: (stop: BusStop | null) => void;
  userLat: number;
  userLng: number;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onSearchThisArea?: () => void;
  routePath?: { lat: number; lng: number }[];
  highlightedRoute?: BusRoute | null;
  className?: string;
}

function MapEvents({
  onBoundsChange,
  onSearchThisArea,
}: {
  onBoundsChange?: (b: any) => void;
  onSearchThisArea?: () => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBoundsChange?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
    zoomend: () => {
      const b = map.getBounds();
      onBoundsChange?.({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    },
  });
  return null;
}

function Recenter({ lat, lng, zoom, once = true }: { lat: number; lng: number; zoom?: number; once?: boolean }) {
  const map = useMap();
  const did = useRef(false);
  useEffect(() => {
    if (once && did.current) return;
    if (lat && lng) {
      map.setView([lat, lng], zoom ?? map.getZoom(), { animate: true });
      did.current = true;
    }
  }, [lat, lng, zoom, map, once]);
  return null;
}

function FlyToSelected({ stop }: { stop: BusStop | null }) {
  const map = useMap();
  useEffect(() => {
    if (stop) {
      map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }, [stop, map]);
  return null;
}

export default function Map({
  stops,
  selectedStop,
  onSelectStop,
  userLat,
  userLng,
  onBoundsChange,
  onSearchThisArea,
  routePath,
  highlightedRoute,
  className = "",
}: MapProps) {
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [showSearchBtn, setShowSearchBtn] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  const visibleStops = useMemo(() => {
    if (!bounds) return stops.slice(0, 80); // initial
    // Limit to ~150 markers for perf
    const filtered = filterStopsInBounds(stops, bounds, 0.003);
    return filtered.slice(0, 200);
  }, [stops, bounds]);

  const handleBounds = useCallback(
    (b: any) => {
      setBounds(b);
      onBoundsChange?.(b);
      setShowSearchBtn(true);
    },
    [onBoundsChange]
  );

  return (
    <div className={`relative w-full h-full ${className}`}>
      <MapContainer
        center={[userLat || DEFAULT_HK_CENTER.lat, userLng || DEFAULT_HK_CENTER.lng]}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full z-0"
        zoomControl={false}
        ref={(ref) => {
          if (ref) mapRef.current = ref;
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEvents onBoundsChange={handleBounds} onSearchThisArea={onSearchThisArea} />
        <Recenter lat={userLat} lng={userLng} />
        <FlyToSelected stop={selectedStop} />

        {/* User location */}
        {userLat && userLng && (
          <Marker position={[userLat, userLng]} icon={userIcon}>
            <Popup>Your location</Popup>
          </Marker>
        )}

        {/* Route path if searching a route */}
        {routePath && routePath.length > 1 && (
          <Polyline
            positions={routePath.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: highlightedRoute?.operator === "KMB" ? "#E30613" : "#003DA5", weight: 5, opacity: 0.75 }}
          />
        )}

        {/* Visible stops */}
        {visibleStops.map((stop) => {
          const isSelected = selectedStop?.id === stop.id;
          return (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={isSelected ? selectedIcon : stopIcon}
              eventHandlers={{
                click: () => onSelectStop(stop),
              }}
            >
              <Popup>
                <div className="text-sm font-medium">
                  <div>{stop.nameEn}</div>
                  <div className="text-gray-500 text-xs">{stop.nameTc}</div>
                  {stop.isMerged && (
                    <div className="text-xs text-amber-600 mt-1">Merged KMB + CTB</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Search this area floating button */}
      {showSearchBtn && onSearchThisArea && (
        <button
          onClick={() => {
            onSearchThisArea();
            setShowSearchBtn(false);
          }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white shadow-lg border border-gray-200 rounded-full px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 active:scale-95 transition flex items-center gap-2"
        >
          <Bus className="w-4 h-4" />
          Search this area
        </button>
      )}

      {/* Zoom controls custom position */}
      <div className="absolute bottom-24 right-3 z-[1000] flex flex-col gap-2 md:bottom-6">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-10 h-10 bg-white rounded-lg shadow border border-gray-200 flex items-center justify-center text-xl font-bold text-gray-700 hover:bg-gray-50"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 bg-white rounded-lg shadow border border-gray-200 flex items-center justify-center text-xl font-bold text-gray-700 hover:bg-gray-50"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>
    </div>
  );
}