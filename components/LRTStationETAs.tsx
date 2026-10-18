"use client";

import useSWR from "swr";
import { getETAs } from "@/utils/static-api";
import type { BusRoute } from "@/types/bus";
import { clsx } from "clsx";

/**
 * Light Rail station ETA view.
 * Shows next trains for a Light Rail stop.
 */
export function LRTStationETAs({ route }: { route: BusRoute }) {
  const lrt = route.lrt;
  const { data: etas, isLoading } = useSWR(
    lrt ? ["lrt-etas", lrt.stationId] : null,
    () =>
      getETAs({
        operator: "LRT",
        lrt: {
          stationId: lrt!.stationId,
          tc: lrt!.tc,
          en: lrt!.en,
        },
      }),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );

  if (!lrt) return null;

  return (
    <div className="space-y-3">
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
        <div className="text-[14px] text-orange-700 font-medium mb-1">
          輕鐵 · Light Rail
        </div>
        <div className="text-[19px] font-bold text-slate-900">
          {lrt.tc}站
        </div>
        <div className="text-[14px] text-slate-500">{lrt.en} Stop</div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-400 text-[15px]">
          載入班次中…
        </div>
      ) : !etas || etas.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 text-center text-[15px] text-slate-500">
          暫無班次（可能已收車）
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
          {etas.map((e, i) => {
            const urgent = e.etaMinutes !== null && e.etaMinutes <= 3 && e.etaMinutes >= 0;
            return (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-bold text-slate-900">{e.route}</div>
                  <div className="text-[13px] text-slate-500 truncate">
                    往 {e.destTc || e.destEn}
                  </div>
                </div>
                <span
                  className={clsx(
                    "text-[17px] font-bold tabular-nums shrink-0 ml-3",
                    e.etaMinutes !== null && e.etaMinutes <= 1
                      ? "text-emerald-600"
                      : e.etaMinutes !== null && e.etaMinutes <= 5
                        ? "text-amber-600"
                        : "text-slate-700",
                    urgent && "eta-urgent"
                  )}
                >
                  {e.etaMinutes === null
                    ? (e.remarkTc || e.remarkEn || "—")
                    : e.etaMinutes <= 0
                      ? "即將到站"
                      : `${e.etaMinutes} 分鐘`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-[12px] text-slate-400 text-center">
        資料每 30 秒更新 · 輕鐵實時班次
      </div>
    </div>
  );
}
