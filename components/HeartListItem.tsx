"use client";

import React from "react";
import useSWR from "swr";
import type { FavoriteRouteStop } from "@/types/bus";
import { clsx } from "clsx";
import { Heart, X } from "lucide-react";

/**
 * HeartListItem: A heart in the favorites list that shows LIVE ETAs directly.
 * No need to tap in to see the bus info.
 */
export function HeartListItem({
  heart,
  index,
  total,
  editOrder,
  onTap,
  onRemove,
  onMove,
}: {
  heart: FavoriteRouteStop;
  index: number;
  total: number;
  editOrder: boolean;
  onTap: () => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  // Fetch live ETAs for this heart's stop
  const { data: etas, isLoading } = useSWR(
    ["heart-list-eta", heart.id],
    async () => {
      const { getRouteStops, getETAs } = await import("@/utils/static-api");
      const stops = await getRouteStops(
        heart.route,
        heart.operator as any,
        heart.bound || "O",
        heart.gmb
      );
      const stop = stops[heart.stopSeq - 1];
      if (!stop) return [];
      // For LRT, fetch directly
      if (heart.operator === "LRT" && heart.lrt) {
        try {
          const res = await fetch(
            `https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=${heart.lrt.stationId}`
          ).then((r) => r.json());
          if (res.status === 1 && res.platform_list) {
            const trains: any[] = [];
            for (const plat of res.platform_list) {
              for (const r of plat.route_list || []) {
                const timeStr = r.time_ch || r.time_en || "-";
                let mins: number | null = null;
                const m = timeStr.match(/(\d+)/);
                if (m) mins = parseInt(m[1], 10);
                if (timeStr.includes("即將") || timeStr.toLowerCase().includes("arriving")) mins = 0;
                trains.push({
                  id: `lrt-${heart.lrt.stationId}-${r.route_no}`,
                  operator: "LRT" as const,
                  route: `${r.route_no}號`,
                  destEn: r.dest_en || "",
                  destTc: r.dest_ch || "",
                  etaMinutes: mins,
                  sequence: trains.length + 1,
                });
              }
            }
            return trains.slice(0, 3);
          }
        } catch {}
        return [];
      }
      // For MTR, fetch directly
      if (heart.operator === "MTRT" && heart.mtrt) {
        try {
          const res = await fetch(
            `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${heart.mtrt.line}&sta=${heart.mtrt.sta}&lang=TC`
          ).then((r) => r.json());
          const trains: any[] = [];
          const data = res.data?.[`${heart.mtrt.line}-${heart.mtrt.sta}`];
          if (data) {
            for (const dir of ["UP", "DOWN"]) {
              const list = data[dir] || [];
              for (const t of list.slice(0, 2)) {
                trains.push({
                  id: `mtr-${heart.mtrt.sta}-${dir}-${t.seq}`,
                  operator: "MTRT" as const,
                  route: heart.mtrt.lineTc,
                  destTc: t.dest || "",
                  etaMinutes: t.time ? parseInt(t.time.split(":")[0]) : null,
                  sequence: trains.length + 1,
                });
              }
            }
          }
          return trains.slice(0, 3);
        } catch {}
        return [];
      }
      // For GMB, need to pass gmb metadata with route_id/route_seq/stop_seq
      if (heart.operator === "GMB" && heart.gmb) {
        return getETAs({
          operator: "GMB",
          gmb: {
            route_id: heart.gmb.route_id,
            route_seq: heart.gmb.route_seq,
            stop_seq: heart.stopSeq,
            code: heart.route,
            dest_tc: heart.destTc,
            dest_en: heart.destEn,
          },
        } as any);
      }
      return getETAs({
        operator: heart.operator as any,
        stopId: stop.stop,
        route: heart.route,
      } as any);
    },
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      dedupingInterval: 15000,
    }
  );

  return (
    <div className="bg-white rounded-2xl border border-rose-100 shadow-sm px-4 py-3">
      <div className="flex items-center gap-3">
        {editOrder && (
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={() => onMove("up")}
              disabled={index === 0}
              className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-30"
              aria-label="上移"
            >
              <span className="text-[14px]">▲</span>
            </button>
            <button
              onClick={() => onMove("down")}
              disabled={index === total - 1}
              className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-30"
              aria-label="下移"
            >
              <span className="text-[14px]">▼</span>
            </button>
          </div>
        )}
        <button
          onClick={() => !editOrder && onTap()}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500 shrink-0" />
            <span className="font-bold text-slate-900 text-[16px]">{heart.route}</span>
            <span className="text-[13px] font-medium text-slate-500">
              第 {heart.stopSeq} 站 · {heart.stopNameTc || heart.stopNameEn}
            </span>
          </div>
          <div className="text-[14px] text-slate-500 truncate mt-0.5 ml-7">
            往 {heart.destTc || heart.destEn}
            {heart.directionLabel && ` · ${heart.directionLabel}`}
          </div>
        </button>
        {!editOrder && (
          <button
            onClick={onRemove}
            className="p-2 shrink-0"
            aria-label="取消心水站"
          >
            <X className="w-4 h-4 text-slate-300" />
          </button>
        )}
      </div>

      {/* Live ETAs directly in the list */}
      {!editOrder && (
        <div className="mt-2 ml-7 pt-2 border-t border-slate-50">
          {isLoading ? (
            <div className="text-[14px] text-slate-400">載入班次中…</div>
          ) : !etas || etas.length === 0 ? (
            <TimetableNote heart={heart} />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              {etas.slice(0, 3).map((e, i) => {
                const urgent = e.etaMinutes !== null && e.etaMinutes <= 3 && e.etaMinutes >= 0;
                return (
                  <span
                    key={i}
                    className={clsx(
                      "text-[16px] font-bold tabular-nums",
                      e.etaMinutes !== null && e.etaMinutes <= 1
                        ? "text-emerald-600"
                        : e.etaMinutes !== null && e.etaMinutes <= 5
                          ? "text-amber-600"
                          : "text-slate-700",
                      urgent && "eta-urgent px-1 rounded"
                    )}
                  >
                    {e.etaMinutes === null
                      ? (e.remarkTc || "—")
                      : e.etaMinutes <= 0
                        ? "即將到站"
                        : `${e.etaMinutes}′`}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Shows timetable info when no real-time ETA (e.g. night)
function TimetableNote({ heart }: { heart: FavoriteRouteStop }) {
  const [timetable, setTimetable] = React.useState<any>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    fetch("timetables.json")
      .then((r) => r.json())
      .then((data) => {
        // Try keys: {operator}-{route}, LRT-{route}, etc.
        const keys = [
          `${heart.operator}-${heart.route}`,
          `LRT-${heart.route}`,
          heart.operator === "LRT" ? `LRT-505` : null,
        ].filter(Boolean);
        for (const k of keys) {
          if (data[k as string]) {
            setTimetable(data[k as string]);
            break;
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [heart]);

  if (!loaded) return <div className="text-[14px] text-slate-400">暫無班次</div>;
  if (!timetable) return <div className="text-[14px] text-slate-400">暫無班次</div>;
  return (
    <div className="text-[13px] text-slate-500">
      暫無班次 · 首班車 {timetable.first}，尾班車 {timetable.last}
      {timetable.note && <span className="block text-[12px] text-slate-400">{timetable.note}</span>}
    </div>
  );
}
