import { Agent, AgentPool, JobRequest, PoolData } from "./types";

/** inactive: tüm agent'ları bilerek devre dışı bırakılmış, kuyruğunda güncel iş olmayan havuz. */
export type Health = "ok" | "warning" | "critical" | "inactive";
export type RequestState = "queued" | "running" | "finished";

/** Bir iş bu süreden uzun beklerse havuz "uyarı" durumuna geçer. */
export const QUEUE_WARN_SEC = 300;
/** Bu süreden uzun bekleyen iş "bayat" sayılır: kuyrukta sayılır ama sağlık kurallarını etkilemez. */
export const STALE_SEC = 24 * 3600;
/** Bu süreden uzun çalışan iş "takılmış olabilir" diye işaretlenir. */
export const STUCK_SEC = 3600;
/** Bu süredir iş almamış agent "kullanılmıyor" sayılır. */
export const UNUSED_SEC = 90 * 24 * 3600;

/** Havuzun neden sorunlu sayıldığı; metne çevirme işi i18n'de yapılır. */
export type Reason =
  | { kind: "listError" }
  | { kind: "offline"; count: number }
  | { kind: "queueWait"; seconds: number }
  | { kind: "noAgent" }
  | { kind: "longRunning"; count: number }
  | { kind: "allDisabled" }
  | { kind: "stale"; count: number };

export interface DurationUnits {
  s: string;
  m: string;
  h: string;
  d: string;
}

export interface PoolSummary {
  total: number;
  online: number;
  offline: number;
  disabled: number;
  busy: number;
  idle: number;
  running: number;
  /** STUCK_SEC'ten uzun süredir çalışan iş sayısı. */
  longRunning: number;
  /** Bekleyen iş sayısı, bayat işler dahil. null: iş istekleri okunamadığı için bilinmiyor. */
  queued: number | null;
  /** Bekleyen işlerden STALE_SEC'ten uzun süredir bekleyenlerin sayısı. */
  stale: number;
  oldestQueuedSec: number | null;
  /** Tamamlanan son işlerin ortalama kuyruk bekleme süresi. */
  avgWaitSec: number | null;
  versions: string[];
  health: Health;
  reasons: Reason[];
}

export function requestState(r: JobRequest): RequestState {
  if (r.finishTime) return "finished";
  return r.receiveTime ? "running" : "queued";
}

/** Kuyrukta geçen süre (sn). Bekleyen iş için şu ana kadar, diğerleri için agent'a ulaşana kadar. */
export function waitSeconds(r: JobRequest, now: number): number | null {
  const queued = r.queueTime ? Date.parse(r.queueTime) : NaN;
  if (Number.isNaN(queued)) return null;
  const started = r.receiveTime ?? r.assignTime;
  const end = started ? Date.parse(started) : requestState(r) === "queued" ? now : NaN;
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - queued) / 1000));
}

/** Çalışan işin agent'a ulaştığından bu yana geçen süre (sn). */
export function runSeconds(r: JobRequest, now: number): number | null {
  const started = Date.parse(r.receiveTime ?? r.assignTime ?? "");
  return Number.isNaN(started) || r.finishTime ? null : Math.max(0, Math.round((now - started) / 1000));
}

export function isLongRunning(r: JobRequest | undefined, now: number): boolean {
  return !!r && (runSeconds(r, now) ?? 0) > STUCK_SEC;
}

export function isStaleRequest(r: JobRequest, now: number): boolean {
  return requestState(r) === "queued" && (waitSeconds(r, now) ?? 0) > STALE_SEC;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function agentState(a: Agent): "disabled" | "offline" | "busy" | "idle" {
  if (!a.enabled) return "disabled";
  if (a.status !== "online") return "offline";
  return a.assignedRequest ? "busy" : "idle";
}

export function summarizePool(data: PoolData, now: number): PoolSummary {
  const states = data.agents.map(agentState);
  const count = (s: string) => states.filter((x) => x === s).length;
  const busy = count("busy");
  const idle = count("idle");
  const offline = count("offline");
  const online = busy + idle;

  let queued: number | null = null;
  let stale = 0;
  let oldestQueuedSec: number | null = null;
  let avgWaitSec: number | null = null;
  let running = busy;

  if (data.requests) {
    const byState = (s: RequestState) => data.requests!.filter((r) => requestState(r) === s);
    const waits = (rs: JobRequest[]) => rs.map((r) => waitSeconds(r, now)).filter((w): w is number => w !== null);
    const fresh = byState("queued").filter((r) => !isStaleRequest(r, now));
    const queuedWaits = waits(fresh);
    const finishedWaits = waits(byState("finished"));
    queued = byState("queued").length;
    stale = queued - fresh.length;
    running = byState("running").length;
    oldestQueuedSec = queuedWaits.length ? Math.max(...queuedWaits) : null;
    avgWaitSec = finishedWaits.length
      ? Math.round(finishedWaits.reduce((a, b) => a + b, 0) / finishedWaits.length)
      : null;
  }

  const reasons: Reason[] = [];
  let health: Health = "ok";
  if (data.error) {
    health = "warning";
    reasons.push({ kind: "listError" });
  }
  if (offline > 0) {
    health = "warning";
    reasons.push({ kind: "offline", count: offline });
  }
  const longRunning = data.agents.filter((a) => isLongRunning(a.assignedRequest, now)).length;
  if (longRunning > 0) {
    health = "warning";
    reasons.push({ kind: "longRunning", count: longRunning });
  }
  if (oldestQueuedSec !== null && oldestQueuedSec > QUEUE_WARN_SEC) {
    health = "warning";
    reasons.push({ kind: "queueWait", seconds: oldestQueuedSec });
  }
  if (data.agents.length > 0 && online === 0) {
    // Tüm agent'lar bilerek kapatılmışsa ve bekleyen güncel iş yoksa bu bir arıza değildir.
    if (count("disabled") === data.agents.length && (queued ?? 0) === stale) {
      health = "inactive";
      reasons.push({ kind: "allDisabled" });
    } else {
      health = "critical";
      reasons.push({ kind: "noAgent" });
    }
  }
  if (stale > 0) reasons.push({ kind: "stale", count: stale });

  const versions = Array.from(new Set(data.agents.map((a) => a.version))).sort(compareVersions);
  return {
    total: data.agents.length,
    online,
    offline,
    disabled: count("disabled"),
    busy,
    idle,
    running,
    longRunning,
    queued,
    stale,
    oldestQueuedSec,
    avgWaitSec,
    versions,
    health,
    reasons,
  };
}

export interface Totals {
  pools: number;
  agents: number;
  offline: number;
  running: number;
  queued: number;
  /** queued içindeki bayat iş sayısı. */
  stale: number;
  /** İş istekleri okunamayan havuz sayısı; queued bu havuzları içermez. */
  queueUnknownPools: number;
  /** Sorunlu (warning/critical) havuz sayısı. */
  problemPools: number;
  inactivePools: number;
}

export function summarizeAll(summaries: PoolSummary[]): Totals {
  return {
    pools: summaries.length,
    agents: summaries.reduce((n, s) => n + s.total, 0),
    offline: summaries.reduce((n, s) => n + s.offline, 0),
    running: summaries.reduce((n, s) => n + s.running, 0),
    queued: summaries.reduce((n, s) => n + (s.queued ?? 0), 0),
    stale: summaries.reduce((n, s) => n + s.stale, 0),
    queueUnknownPools: summaries.filter((s) => s.queued === null).length,
    problemPools: summaries.filter((s) => s.health === "warning" || s.health === "critical").length,
    inactivePools: summaries.filter((s) => s.health === "inactive").length,
  };
}

const HEALTH_ORDER: Record<Health, number> = { critical: 0, warning: 1, ok: 2, inactive: 3 };

/** Sorunlu havuzlar üstte, devre dışı havuzlar altta, sonra ada göre. */
export function sortByHealth<T extends { summary: PoolSummary; data: PoolData }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      HEALTH_ORDER[a.summary.health] - HEALTH_ORDER[b.summary.health] ||
      a.data.pool.name.localeCompare(b.data.pool.name),
  );
}

export function formatDuration(sec: number, u: DurationUnits): string {
  if (sec < 60) return `${sec} ${u.s}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return sec % 60 ? `${min} ${u.m} ${sec % 60} ${u.s}` : `${min} ${u.m}`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return min % 60 ? `${hours} ${u.h} ${min % 60} ${u.m}` : `${hours} ${u.h}`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} ${u.d} ${hours % 24} ${u.h}` : `${days} ${u.d}`;
}

export interface UnusedAgent {
  agent: Agent;
  pool: AgentPool;
  /** Son işin bitişinden (hiç iş almadıysa kayıt anından) bu yana geçen süre. */
  idleSec: number;
  neverRan: boolean;
}

/** UNUSED_SEC'ten uzun süredir iş almamış agent'lar; en uzun süredir boş olan üstte. */
export function findUnusedAgents(pools: PoolData[], now: number): UnusedAgent[] {
  const result: UnusedAgent[] = [];
  for (const { pool, agents } of pools) {
    for (const agent of agents) {
      if (agent.assignedRequest) continue;
      const lastFinish = agent.lastCompletedRequest?.finishTime;
      const since = Date.parse(lastFinish ?? agent.createdOn ?? "");
      if (Number.isNaN(since)) continue;
      const idleSec = Math.round((now - since) / 1000);
      if (idleSec > UNUSED_SEC) result.push({ agent, pool, idleSec, neverRan: !lastFinish });
    }
  }
  return result.sort((a, b) => b.idleSec - a.idleSec);
}

/**
 * Agent'ın bildirdiği uzun işletim sistemi satırını kısaltır, örn.
 * "Darwin 25.3.0 Darwin Kernel Version 25.3.0: Wed Jan 28 …" → "macOS (Darwin 25.3)".
 */
export function shortOs(description: string): string {
  const text = description.trim();
  const darwin = /^Darwin (\d+\.\d+)/.exec(text);
  if (darwin) return `macOS (Darwin ${darwin[1]})`;
  if (text.startsWith("Linux ")) return text.split(" #")[0];
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

/** Bekleyen bir işin neden başlamadığı. */
export type WaitReason =
  /** Hiçbir agent işin isteklerini karşılamıyor; missing: hiçbir agent'ta olmayan istekler. */
  | { kind: "noMatch"; missing: string[] }
  /** Uygun agent boşta: iş atanmak üzere ya da sunucu tarafında (onay, paralel iş sınırı) bekliyor. */
  | { kind: "idle"; count: number }
  | { kind: "busy"; count: number }
  | { kind: "unavailable"; offline: number; disabled: number };

/**
 * Agent tek bir isteği karşılıyor mu? Biçimler: "ad", "ad -equals değer", "ad -gtVersion sürüm".
 * Agent'ın yetenek listesi yoksa ya da işleç tanınmıyorsa karşıladığı varsayılır.
 */
export function satisfiesDemand(agent: Agent, demand: string): boolean {
  if (!agent.systemCapabilities && !agent.userCapabilities) return true;
  const match = /^(\S+)(?:\s+-(\w+)\s+(.*))?$/.exec(demand.trim());
  if (!match) return true;
  const [, name, op, expected] = match;
  const caps = { ...agent.systemCapabilities, ...agent.userCapabilities };
  const key = Object.keys(caps).find((k) => k.toLowerCase() === name.toLowerCase());
  if (key === undefined) return false;
  const actual = caps[key];
  if (op === "equals") return actual.toLowerCase() === expected.trim().toLowerCase();
  if (op === "gtVersion") return compareVersions(actual, expected.trim()) > 0;
  return true;
}

/** Bekleyen işi havuzdaki agent'larla karşılaştırıp neden başlamadığını söyler. */
export function explainWait(r: JobRequest, agents: Agent[]): WaitReason {
  const demands = r.demands ?? [];
  const matchedIds = new Set((r.matchedAgents ?? []).map((a) => a.id));
  // Sunucu eşleşen agent'ları bildirdiyse ona güven; yoksa istekleri kendimiz karşılaştır.
  const matching = matchedIds.size
    ? agents.filter((a) => matchedIds.has(a.id))
    : agents.filter((a) => demands.every((d) => satisfiesDemand(a, d)));
  if (!matching.length) {
    return { kind: "noMatch", missing: demands.filter((d) => !agents.some((a) => satisfiesDemand(a, d))) };
  }
  const count = (s: string) => matching.filter((a) => agentState(a) === s).length;
  if (count("idle")) return { kind: "idle", count: count("idle") };
  if (count("busy")) return { kind: "busy", count: count("busy") };
  return { kind: "unavailable", offline: count("offline"), disabled: count("disabled") };
}

export interface RowFilter {
  /** Havuz ya da agent adında aranır. */
  query: string;
  onlyProblems: boolean;
  hideInactive: boolean;
}

/** Sayfanın kapsamı: tüm havuzlar, yalnızca pipeline (agent) havuzları ya da yalnızca deployment havuzları. */
export type PoolScope = "all" | "automation" | "deployment";

export function inScope(data: PoolData, scope: PoolScope): boolean {
  return scope === "all" || data.pool.poolType === scope;
}

export function filterRows<T extends { summary: PoolSummary; data: PoolData }>(rows: T[], f: RowFilter): T[] {
  const q = f.query.trim().toLocaleLowerCase();
  return rows.filter(({ summary, data }) => {
    if (f.onlyProblems && summary.health !== "warning" && summary.health !== "critical") return false;
    if (f.hideInactive && summary.health === "inactive") return false;
    if (!q) return true;
    return (
      data.pool.name.toLocaleLowerCase().includes(q) ||
      data.agents.some((a) => a.name.toLocaleLowerCase().includes(q))
    );
  });
}

export interface QueueGroup {
  /** Pipeline adı; adı olmayan iş kendi başına bir gruptur. */
  name?: string;
  /** En uzun bekleyen başta. */
  jobs: JobRequest[];
  oldestSec: number;
}

/** Bekleyen işleri pipeline'a göre gruplar; en kalabalık grup üstte, eşitlikte en uzun bekleyen. */
export function groupQueue(items: JobRequest[], now: number): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const r of items) {
    const name = r.definition?.name;
    const key = name ?? `#${r.requestId}`;
    const group = groups.get(key) ?? { name, jobs: [], oldestSec: 0 };
    group.jobs.push(r);
    groups.set(key, group);
  }
  const wait = (r: JobRequest) => waitSeconds(r, now) ?? 0;
  for (const g of groups.values()) {
    g.jobs.sort((a, b) => wait(b) - wait(a));
    g.oldestSec = wait(g.jobs[0]);
  }
  return [...groups.values()].sort((a, b) => b.jobs.length - a.jobs.length || b.oldestSec - a.oldestSec);
}

export interface PipelineUsage {
  name?: string;
  count: number;
  /** İşlerin agent üzerinde geçirdiği toplam süre. */
  totalSec: number;
}

/** Tamamlanan işlerin pipeline'a göre dağılımı; agent'ı en çok meşgul eden üstte. */
export function usageByPipeline(requests: JobRequest[]): PipelineUsage[] {
  const usage = new Map<string, PipelineUsage>();
  for (const r of requests) {
    if (!r.finishTime) continue;
    const name = r.definition?.name;
    const entry = usage.get(name ?? "") ?? { name, count: 0, totalSec: 0 };
    const ran = (Date.parse(r.finishTime) - Date.parse(r.receiveTime ?? r.assignTime ?? "")) / 1000;
    entry.count++;
    entry.totalSec += Number.isNaN(ran) ? 0 : Math.max(0, Math.round(ran));
    usage.set(name ?? "", entry);
  }
  return [...usage.values()].sort((a, b) => b.totalSec - a.totalSec || b.count - a.count);
}

/** Online agent'ların yüzde kaçı meşgul; online agent yoksa null. */
export function occupancy(s: PoolSummary): number | null {
  return s.online > 0 ? Math.round((s.busy / s.online) * 100) : null;
}

export interface Capability {
  name: string;
  value: string;
  /** Kullanıcının elle tanımladığı yetenek; değilse agent'ın kendi bildirdiği. */
  user: boolean;
}

/** Agent'ın yetenekleri: kullanıcı tanımlılar önce, her grup kendi içinde ada göre. */
export function capabilityList(agent: Agent): Capability[] {
  const list = (caps: Record<string, string> | undefined, user: boolean) =>
    Object.entries(caps ?? {})
      .map(([name, value]) => ({ name, value, user }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return [...list(agent.userCapabilities, true), ...list(agent.systemCapabilities, false)];
}
