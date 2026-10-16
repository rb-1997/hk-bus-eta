"use client";

import useSWR from "swr";
import type { BusStop, ETA, BusRoute, RouteStopSeq } from "@/types/bus";
import {
  getStops,
  getETAs,
  searchRoutes,
  getRouteStops,
} from "@/utils/static-api";

export function useStops() {
  const { data, error, isLoading, mutate } = useSWR<BusStop[]>(
    "stops",
    () => getStops(),
    {
      revalidateOnFocus: false,
      revalidateIfStale: true,
      dedupingInterval: 3600000, // 1h
      errorRetryCount: 2,
    }
  );

  return {
    stops: data || [],
    isLoading,
    error: error?.message || null,
    refresh: mutate,
  };
}

export function useETA(
  stop: BusStop | null,
  enabled = true
) {
  // Build query: use first originalId preferably KMB
  let key: [string, object] | null = null;
  if (stop && enabled) {
    const kmbOrig = stop.originalIds.find((o) => o.operator === "KMB");
    const ctbOrig = stop.originalIds.find((o) => o.operator === "CTB");
    const query: {
      stopId: string;
      operator?: "KMB" | "CTB" | "GMB";
      originalId?: string;
      routes?: string;
      gmb?: {
        route_id: number;
        route_seq: number;
        stop_seq: number;
        code: string;
        dest_tc: string;
        dest_en: string;
      };
    } = { stopId: stop.id };
    if (stop.gmb) {
      query.operator = "GMB";
      query.gmb = stop.gmb;
    } else if (kmbOrig) {
      query.operator = "KMB";
      query.originalId = kmbOrig.id;
    } else if (ctbOrig) {
      query.operator = "CTB";
      query.originalId = ctbOrig.id;
      // For CTB alone, we can't easily know all routes without extra data; ETA will be empty or user uses route search
    }
    key = ["eta", query];
  }

  const { data, error, isLoading, isValidating, mutate } = useSWR<ETA[]>(
    key,
    (k: [string, object]) => getETAs(k[1] as Parameters<typeof getETAs>[0]),
    {
      refreshInterval: 60000, // auto every 60s as backup
      revalidateOnFocus: true,
      dedupingInterval: 10000,
      errorRetryCount: 3,
    }
  );

  return {
    etas: data || [],
    isLoading,
    isValidating,
    error: error?.message || null,
    refresh: mutate,
    timestamp: undefined as string | undefined,
  };
}

export function useRouteSearch(query: string) {
  const q = query.trim();
  const key = q.length >= 1 ? (["routes", q] as [string, string]) : null;

  const { data, error, isLoading } = useSWR<BusRoute[]>(key, (k: [string, string]) => searchRoutes(k[1]), {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return {
    routes: data || [],
    isLoading,
    error: error?.message || null,
  };
}

export function useRouteStops(
  route: string | null,
  operator: "KMB" | "CTB" | "LWB" | "GMB" | null,
  bound: string = "O",
  gmbMeta?: { region: string; code: string; route_id: number; route_seq: number }
) {
  const key =
    route && operator
      ? (["route-stops", route, operator, bound, gmbMeta?.route_seq ?? 0] as [string, string, string, string, number])
      : null;

  const { data, error, isLoading } = useSWR<RouteStopSeq[]>(key, (k: [string, string, string, string, number]) =>
    getRouteStops(k[1], k[2] as "KMB" | "CTB" | "LWB" | "GMB", k[3], gmbMeta), {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });

  return {
    stopSeqs: (data || []) as RouteStopSeq[],
    isLoading,
    error: error?.message || null,
  };
}
