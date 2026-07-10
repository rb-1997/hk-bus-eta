export type Operator = "KMB" | "CTB" | "LWB";

export interface BusStop {
  id: string; // unified or original
  originalIds: { operator: Operator; id: string }[];
  nameEn: string;
  nameTc: string;
  nameSc?: string;
  lat: number;
  lng: number;
  // For merged
  isMerged?: boolean;
}

export interface BusRoute {
  id: string; // e.g. "KMB-101-1" or "CTB-107"
  operator: Operator;
  route: string;
  serviceType?: string; // KMB only, "1" usually
  bound?: "I" | "O" | "inbound" | "outbound"; // direction
  originEn: string;
  originTc: string;
  destEn: string;
  destTc: string;
  // For display
  directionLabel?: string;
}

export interface ETA {
  id: string;
  operator: Operator;
  route: string;
  destEn: string;
  destTc: string;
  eta: string | null; // ISO or null if unknown
  etaMinutes: number | null;
  remarkEn?: string;
  remarkTc?: string;
  sequence: number;
  isRealtime: boolean;
}

export interface StopWithRoutes {
  stop: BusStop;
  routes: BusRoute[];
  etas: ETA[];
}

export interface FavoriteStop {
  id: string;
  nameEn: string;
  nameTc: string;
  lat: number;
  lng: number;
  savedAt: number;
}

// Raw API types (partial)
export interface KMBStopRaw {
  stop: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: string;
  long: string;
}

export interface KMBRouteRaw {
  route: string;
  bound: string; // "I" | "O"
  service_type: string;
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
}

export interface KMBETARaw {
  co: string;
  route: string;
  dir: string;
  service_type: number;
  seq: number;
  dest_tc: string;
  dest_en: string;
  eta_seq: number;
  eta: string | null;
  rmk_tc: string;
  rmk_en: string;
  data_timestamp: string;
}

export interface CTBStopRaw {
  stop: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  long: number;
}

export interface CTBRouteRaw {
  co: string;
  route: string;
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
}

export interface CTBETARaw {
  co: string;
  route: string;
  dir: string;
  seq: number;
  stop: string;
  dest_tc: string;
  dest_en: string;
  eta_seq: number;
  eta: string | null;
  rmk_tc: string;
  rmk_en: string;
  data_timestamp: string;
}