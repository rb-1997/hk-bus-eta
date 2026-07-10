"use client";

import useSWR from "swr";
import type { BusStop, ETA, BusRoute } from "@/types/bus";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

export function useStops() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/stops",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: true,
      dedupingInterval: 3600000, // 1h
      errorRetryCount: 2,
    }
  );

  return {
    stops: (data?.data || []) as BusStop[],
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
  let key: string | null = null;
  if (stop && enabled) {
    const kmbOrig = stop.originalIds.find((o) => o.operator === "KMB");
    const ctbOrig = stop.originalIds.find((o) => o.operator === "CTB");
    const params = new URLSearchParams();
    if (kmbOrig) {
      params.set("operator", "KMB");
      params.set("originalId", kmbOrig.id);
      params.set("stopId", stop.id);
    } else if (ctbOrig) {
      params.set("operator", "CTB");
      params.set("originalId", ctbOrig.id);
      params.set("stopId", stop.id);
      // For CTB alone, we can't easily know all routes without extra data; ETA will be empty or user uses route search
    } else {
      params.set("stopId", stop.id);
    }
    key = `/api/eta?${params.toString()}`;
  }

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    key,
    fetcher,
    {
      refreshInterval: 60000, // auto every 60s as backup
      revalidateOnFocus: true,
      dedupingInterval: 10000,
      errorRetryCount: 3,
    }
  );

  return {
    etas: (data?.data || []) as ETA[],
    isLoading,
    isValidating,
    error: error?.message || null,
    refresh: mutate,
    timestamp: data?.timestamp as string | undefined,
  };
}

export function useRouteSearch(query: string) {
  const q = query.trim();
  const key = q.length >= 1 ? `/api/routes?q=${encodeURIComponent(q)}` : null;

  const { data, error, isLoading } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  return {
    routes: (data?.data || []) as BusRoute[],
    isLoading,
    error: error?.message || null,
  };
}

export function useRouteStops(
  route: string | null,
  operator: "KMB" | "CTB" | "LWB" | null,
  bound: string = "O"
) {
  const key =
    route && operator
      ? `/api/routes?detail=true&route=${encodeURIComponent(route)}&operator=${operator}&bound=${bound}`
      : null;

  const { data, error, isLoading } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
  });

  return {
    stopSeqs: (data?.data || []) as { stop: string; seq: number }[],
    isLoading,
    error: error?.message || null,
  };
}