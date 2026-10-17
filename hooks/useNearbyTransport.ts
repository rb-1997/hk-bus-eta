"use client";

import { useState, useEffect } from "react";
import type { BusStop } from "@/types/bus";

export interface NearbyTransport {
  kind: "bus" | "mtr" | "lrt";
  id: string;
  nameTc: string;
  nameEn: string;
  lat: number;
  lng: number;
  dist: number;
  // For bus: BusStop object; for mtr/lrt: metadata for ETA fetching
  busStop?: BusStop;
  mtrt?: { line: string; sta: string; lineTc: string; lineEn: string };
  lrt?: { stationId: string; tc: string; en: string };
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Load all nearby transport (bus stops + MTR stations + Light Rail stops)
 * within 800m, sorted by distance. NO limit — show everything.
 */
export function useNearbyTransport(
  userLat: number,
  userLng: number,
  busStops: BusStop[]
): NearbyTransport[] {
  const [items, setItems] = useState<NearbyTransport[]>([]);

  useEffect(() => {
    if (!userLat || !userLng) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const all: NearbyTransport[] = [];

      // Bus stops (within 800m)
      for (const s of busStops) {
        if (s.lat == null || s.lng == null) continue;
        const dist = haversine(userLat, userLng, s.lat, s.lng);
        if (dist <= 800) {
          all.push({
            kind: "bus",
            id: s.id,
            nameTc: s.nameTc,
            nameEn: s.nameEn,
            lat: s.lat,
            lng: s.lng,
            dist,
            busStop: s,
          });
        }
      }

      // MTR train stations (within 800m)
      try {
        const res = await fetch("mtr/train-stations.json");
        const data = await res.json();
        const lineNames: Record<string, string> = {
          AEL: "機場快綫", TCL: "東涌綫", TML: "屯馬綫", TKL: "將軍澳綫",
          EAL: "東鐵綫", SIL: "南港島綫", TWL: "荃灣綫", ISL: "港島綫",
          KTL: "觀塘綫", DRL: "迪士尼綫",
        };
        for (const [lineCode, stations] of Object.entries(data.lines) as [string, any[]][]) {
          if (lineCode === "" || !Array.isArray(stations)) continue;
          for (const st of stations) {
            if (st.lat == null || st.lng == null) continue;
            const dist = haversine(userLat, userLng, st.lat, st.lng);
            if (dist <= 800) {
              all.push({
                kind: "mtr",
                id: `mtr-${lineCode}-${st.code}`,
                nameTc: `${st.tc}站`,
                nameEn: `${st.en} Station`,
                lat: st.lat,
                lng: st.lng,
                dist,
                mtrt: {
                  line: lineCode,
                  sta: st.code,
                  lineTc: lineNames[lineCode] || lineCode,
                  lineEn: lineCode,
                },
              });
            }
          }
        }
      } catch {}

      // Light Rail stops (within 800m)
      try {
        const res = await fetch("mtr/light-rail.json");
        const data = await res.json();
        for (const s of Object.values(data.stops) as any[]) {
          if (s.lat == null || s.lng == null) continue;
          const dist = haversine(userLat, userLng, s.lat, s.lng);
          if (dist <= 800) {
            all.push({
              kind: "lrt",
              id: `lrt-${s.id}`,
              nameTc: `${s.tc}站`,
              nameEn: `${s.en} Stop`,
              lat: s.lat,
              lng: s.lng,
              dist,
              lrt: { stationId: s.id, tc: s.tc, en: s.en },
            });
          }
        }
      } catch {}

      if (!cancelled) {
        // Sort by distance, no limit
        all.sort((a, b) => a.dist - b.dist);
        setItems(all);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userLat, userLng, busStops]);

  return items;
}
