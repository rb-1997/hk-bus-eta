"use client";

import { useState, useEffect, useCallback } from "react";
import type { FavoriteRouteStop, BusRoute } from "@/types/bus";

const STORAGE_KEY = "hk-bus-eta-fav-hearts";

export interface HeartInput {
  route: BusRoute;
  stopSeq: number;
  stopNameTc: string;
  stopNameEn: string;
}

function heartId(route: BusRoute, stopSeq: number): string {
  return `hrt-${route.operator}-${route.id}-${stopSeq}`;
}

export function useFavoriteHearts() {
  const [hearts, setHearts] = useState<FavoriteRouteStop[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setHearts(JSON.parse(raw));
      }
    } catch (e) {
      console.warn("Failed to load fav hearts", e);
    }
    setLoaded(true);
  }, []);

  const persist = useCallback((list: FavoriteRouteStop[]) => {
    setHearts(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }, []);

  const isHeart = useCallback(
    (route: BusRoute, stopSeq: number) =>
      hearts.some((h) => h.id === heartId(route, stopSeq)),
    [hearts]
  );

  const toggleHeart = useCallback((input: HeartInput) => {
    const { route, stopSeq, stopNameTc, stopNameEn } = input;
    const id = heartId(route, stopSeq);
    setHearts((prev) => {
      const exists = prev.some((h) => h.id === id);
      const next: FavoriteRouteStop[] = exists
        ? prev.filter((h) => h.id !== id)
        : [
            ...prev,
            {
              id,
              routeId: route.id,
              route: route.route,
              operator: route.operator,
              directionLabel: route.directionLabel,
              bound: route.bound,
              originTc: route.originTc || "",
              originEn: route.originEn || "",
              destTc: route.destTc || "",
              destEn: route.destEn || "",
              stopSeq,
              stopNameTc: stopNameTc || "",
              stopNameEn: stopNameEn || "",
              gmb: route.gmb,
              savedAt: Date.now(),
            },
          ];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const removeHeart = useCallback(
    (id: string) => {
      persist(hearts.filter((h) => h.id !== id));
    },
    [hearts, persist]
  );

  const moveHeart = useCallback(
    (id: string, direction: "up" | "down") => {
      const idx = hearts.findIndex((h) => h.id === id);
      if (idx === -1) return;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= hearts.length) return;
      const next = [...hearts];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      persist(next);
    },
    [hearts, persist]
  );

  return { hearts, loaded, isHeart, toggleHeart, removeHeart, moveHeart };
}
