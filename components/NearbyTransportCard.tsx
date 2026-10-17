"use client";

import { useState } from "react";
import useSWR from "swr";
import { getETAs } from "@/utils/static-api";
import type { ETA, BusStop } from "@/types/bus";
import type { NearbyTransport } from "@/hooks/useNearbyTransport";
import { clsx } from "clsx";
import { ChevronDown, Star, StarOff } from "lucide-react";

function etaText(e: ETA): string {
  if (e.etaMinutes === null) return e.remarkTc || e.remarkEn || "—";
  if (e.etaMinutes <= 0) return "即將到站";
  return `${e.etaMinutes} 分鐘`;
}

function etaColor(e: ETA): string {
  if (e.etaMinutes === null) return "text-slate-400";
  if (e.etaMinutes <= 1) return "text-emerald-600";
  if (e.etaMinutes <= 5) return "text-amber-600";
  return "text-slate-700";
}

function isUrgent(e: ETA): boolean {
  return e.etaMinutes !== null && e.etaMinutes <= 3 && e.etaMinutes >= 0;
}

function KindBadge({ kind }: { kind: string }) {
  if (kind === "mtr") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#8e44ad] text-white shrink-0">
        鐵路
      </span>
    );
  }
  if (kind === "lrt") {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e67e22] text-white shrink-0">
        輕鐵
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-500 text-white shrink-0">
      巴士站
    </span>
  );
}

/**
 * Unified nearby card for bus stops, MTR stations, and Light Rail stops.
 * Fetches ETAs based on kind.
 */
export function NearbyTransportCard({
  item,
  defaultExpanded,
  onTapRoute,
}: {
  item: NearbyTransport;
  defaultExpanded: boolean;
  onTapRoute: (eta: ETA) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Fetch ETAs based on kind
  const swrKey =
    item.kind === "bus" && item.busStop
      ? ["nearby-bus", item.id]
      : item.kind === "mtr" && item.mtrt
        ? ["nearby-mtr", item.mtrt.line, item.mtrt.sta]
        : item.kind === "lrt" && item.lrt
          ? ["nearby-lrt", item.lrt.stationId]
          : null;

  const { data: etas, isLoading } = useSWR(
    swrKey,
    async () => {
      if (item.kind === "bus" && item.busStop) {
        // Use getAllETAsForStop for bus (includes cross-operator)
        const { getAllETAsForStop } = await import("@/utils/static-api");
        return getAllETAsForStop(item.busStop);
      } else if (item.kind === "mtr" && item.mtrt) {
        return getETAs({
          operator: "MTRT",
          mtrt: {
            line: item.mtrt.line,
            sta: item.mtrt.sta,
            lineTc: item.mtrt.lineTc,
            lineEn: item.mtrt.lineEn,
          },
        });
      } else if (item.kind === "lrt" && item.lrt) {
        return getETAs({
          operator: "LRT",
          lrt: {
            stationId: item.lrt.stationId,
            tc: item.lrt.tc,
            en: item.lrt.en,
          },
        });
      }
      return [];
    },
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      dedupingInterval: 15000,
    }
  );

  const shown = expanded ? (etas || []) : (etas || []).slice(0, 4);
  const distText =
    item.dist < 1000 ? `${Math.round(item.dist)}m` : `${(item.dist / 1000).toFixed(1)}km`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 active:bg-slate-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <KindBadge kind={item.kind} />
            <span className="font-semibold text-slate-900 text-[15px] truncate">
              {item.nameTc}
            </span>
            <span className="text-[11px] text-sky-600 font-medium tabular-nums shrink-0">
              {distText}
            </span>
          </div>
          {item.nameEn && (
            <div className="text-[12px] text-slate-400 truncate mt-0.5">{item.nameEn}</div>
          )}
          {item.kind === "mtr" && item.mtrt && (
            <div className="text-[11px] text-purple-600 mt-0.5">{item.mtrt.lineTc}</div>
          )}
        </div>
        <ChevronDown
          className={clsx(
            "w-5 h-5 text-slate-400 shrink-0 mt-0.5 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      <div className="px-4 pb-3">
        {isLoading ? (
          <div className="text-[13px] text-slate-400 py-2">載入班次中…</div>
        ) : !etas || etas.length === 0 ? (
          <div className="text-[13px] text-slate-400 py-2">暫無班次</div>
        ) : (
          <div className="space-y-1.5">
            {shown.map((e, i) => (
              <button
                key={i}
                onClick={() => onTapRoute(e)}
                className="w-full flex items-center gap-2 py-1.5 text-left active:bg-slate-50 rounded-lg px-1"
              >
                <span className="font-bold text-sky-700 text-[14px] underline decoration-sky-200 underline-offset-2 shrink-0">
                  {e.route}
                </span>
                <span className="text-[12px] text-slate-500 truncate flex-1">
                  往 {e.destTc || e.destEn}
                </span>
                <span
                  className={clsx(
                    "text-[13px] font-semibold tabular-nums shrink-0",
                    etaColor(e),
                    isUrgent(e) && "eta-urgent"
                  )}
                >
                  {etaText(e)}
                </span>
              </button>
            ))}
            {!expanded && (etas || []).length > 4 && (
              <div className="text-[11px] text-slate-400 text-center pt-1">
                仲有 {(etas || []).length - 4} 班…撳入去睇晒
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
