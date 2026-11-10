import { DurationUnits, formatDuration, Reason, STUCK_SEC, WaitReason } from "./metrics";

export type Lang = "tr" | "en";

/** Azure DevOps kullanıcı dili (örn. "tr-TR") → desteklenen dil. Türkçe dışındaki her dil İngilizce görür. */
export function pickLang(culture: string | undefined | null): Lang {
  return (culture ?? "").toLowerCase().startsWith("tr") ? "tr" : "en";
}

/**
 * Dil kaynaklarını sırayla dener; hata fırlatanı ya da boş döneni atlar.
 * Azure DevOps Server 2022'de SDK.getPageContext() hata fırlattığı için gerekir.
 */
export function firstCulture(sources: Array<() => string | undefined | null>): string | undefined {
  for (const read of sources) {
    try {
      const value = read();
      if (value) return value;
    } catch {
      // bu kaynak kullanılamıyor, sıradakine geç
    }
  }
  return undefined;
}

export interface Strings {
  locale: string;
  units: DurationUnits;
  title: string;
  lastUpdated: (time: string) => string;
  demoData: string;
  autoRefreshOn: string;
  autoRefreshOff: string;
  refresh: string;
  refreshing: string;
  loading: string;
  loadError: (detail: string) => string;
  noPools: string;
  tileProblemPools: string;
  tileOfflineAgents: string;
  tileRunning: string;
  tileQueued: string;
  queueUnknownPools: (n: number) => string;
  inactivePoolsNote: (n: number) => string;
  staleNote: (n: number, threshold: string) => string;
  staleJobs: (threshold: string) => string;
  changedAgo: (duration: string) => string;
  unusedTitle: (n: number) => string;
  unusedHint: (threshold: string) => string;
  colPool: string;
  longRunning: string;
  searchPlaceholder: string;
  filterProblems: string;
  filterHideInactive: string;
  noMatches: string;
  scopeLabel: string;
  scope: { all: string; automation: string; deployment: string };
  deploymentTag: string;
  oldestWaiting: (duration: string) => string;
  usageTitle: (jobs: number) => string;
  usageRow: (count: number, duration: string) => string;
  waitReason: (r: WaitReason) => string;
  lastJobAgo: (name: string, duration: string) => string;
  neverRan: (duration: string) => string;
  noProblems: string;
  statOnline: string;
  statRunning: string;
  statQueued: string;
  statAvgWait: string;
  statOccupancy: string;
  percent: (n: number) => string;
  capabilities: (n: number) => string;
  capFilter: string;
  capUser: string;
  capNone: string;
  exportCsv: string;
  csvFileName: string;
  csvSeparator: string;
  csvHeaders: string[];
  csvPoolType: { automation: string; deployment: string };
  agentListError: (detail: string) => string;
  queueUnreadable: string;
  outdatedNote: (n: number, latest: string) => string;
  outdatedBadge: string;
  driftTitle: (missing: number, different: number) => string;
  driftOnlyMissing: string;
  driftMissing: string;
  driftNone: string;
  colCapability: string;
  filterMine: string;
  requestedBy: (name: string) => string;
  queuedJobs: string;
  showAllQueued: (count: number) => string;
  showFewerQueued: string;
  waiting: (duration: string) => string;
  colAgent: string;
  colStatus: string;
  colVersion: string;
  colRunningJob: string;
  colLastJob: string;
  startedAgo: (duration: string) => string;
  finishedAgo: (result: string, duration: string) => string;
  request: (id: number) => string;
  unknown: string;
  emptyPool: string;
  openPoolSettings: string;
  agentState: { idle: string; busy: string; offline: string; disabled: string };
  result: Record<string, string>;
  reason: (r: Reason) => string;
}

const tr: Strings = {
  locale: "tr-TR",
  units: { s: "sn", m: "dk", h: "sa", d: "gün" },
  title: "Agent Havuzu Sağlık Panosu",
  lastUpdated: (t) => `Son güncelleme: ${t}`,
  demoData: "örnek veri",
  autoRefreshOn: "Otomatik yenileme: açık",
  autoRefreshOff: "Otomatik yenileme: kapalı",
  refresh: "Yenile",
  refreshing: "Yenileniyor…",
  loading: "Yükleniyor…",
  loadError: (d) => `Agent havuzları okunamadı (${d}). Agent havuzlarını görme yetkiniz olduğunu kontrol edin.`,
  noPools: "Görebildiğiniz bir self-hosted agent havuzu yok.",
  tileProblemPools: "Sorunlu havuz",
  tileOfflineAgents: "Offline agent",
  tileRunning: "Çalışan iş",
  tileQueued: "Bekleyen iş",
  queueUnknownPools: (n) => `${n} havuzun kuyruğu okunamadı`,
  inactivePoolsNote: (n) => `${n} havuz devre dışı`,
  staleNote: (n, d) => `${n} tanesi bayat (${d} üzeri bekleyen)`,
  staleJobs: (d) => `Bayat işler (${d} üzeri bekleyen)`,
  changedAgo: (d) => `${d} önce`,
  unusedTitle: (n) => `Kullanılmayan agent'lar (${n})`,
  unusedHint: (d) => `Son ${d} içinde hiç iş almamış; kaldırılabilir ya da yeniden değerlendirilebilir`,
  colPool: "Havuz",
  longRunning: "Uzun sürüyor",
  searchPlaceholder: "Havuz ya da agent ara",
  filterProblems: "Yalnızca sorunlular",
  filterHideInactive: "Devre dışıları gizle",
  noMatches: "Filtreye uyan havuz yok.",
  scopeLabel: "Gösterilen havuzlar",
  scope: { all: "Tümü", automation: "Agent havuzları", deployment: "Deployment havuzları" },
  deploymentTag: "Deployment",
  oldestWaiting: (d) => `en eskisi ${d} bekliyor`,
  usageTitle: (n) => `Kullanım: tamamlanan son ${n} iş`,
  usageRow: (n, d) => `${n} iş · ${d}`,
  waitReason: (r) => {
    switch (r.kind) {
      case "noMatch":
        return r.missing.length
          ? `Uygun agent yok; karşılanmayan istek: ${r.missing.slice(0, 3).join(", ")}`
          : "Uygun agent yok";
      case "idle":
        return `${r.count} uygun agent boşta; atanmayı bekliyor`;
      case "busy":
        return `Uygun ${r.count} agent'ın hepsi meşgul`;
      case "unavailable":
        return `Uygun agent'lar çalışmıyor (${[
          r.offline ? `${r.offline} offline` : "",
          r.disabled ? `${r.disabled} devre dışı` : "",
        ]
          .filter(Boolean)
          .join(", ")})`;
    }
  },
  lastJobAgo: (name, d) => `${name}, ${d} önce`,
  neverRan: (d) => `Hiç iş almadı; ${d} önce eklendi`,
  noProblems: "Sorun yok",
  statOnline: "Online",
  statRunning: "Çalışan iş",
  statQueued: "Bekleyen iş",
  statAvgWait: "Ort. bekleme",
  statOccupancy: "Doluluk",
  percent: (n) => `%${n}`,
  capabilities: (n) => `Yetenekler (${n})`,
  capFilter: "Yeteneklerde ara",
  capUser: "Kullanıcı tanımlı",
  capNone: "Eşleşen yetenek yok.",
  exportCsv: "CSV indir",
  csvFileName: "agent-envanteri",
  // Türkçe Excel liste ayracı olarak noktalı virgül bekler.
  csvSeparator: ";",
  csvHeaders: [
    "Havuz",
    "Havuz türü",
    "Agent",
    "Durum",
    "Sürüm",
    "İşletim sistemi",
    "Durum değişimi",
    "Çalışan iş",
    "Son iş",
    "Son iş sonucu",
    "Son iş bitişi",
    "Kullanılmayan gün",
  ],
  csvPoolType: { automation: "Agent", deployment: "Deployment" },
  agentListError: (d) => `Agent listesi okunamadı (${d}). Bu havuzda okuma yetkiniz olmayabilir.`,
  queueUnreadable: "İş kuyruğu okunamadı; bekleyen iş sayısı ve bekleme süresi gösterilemiyor.",
  outdatedNote: (n, latest) => `${n} agent eski sürümde (havuzdaki en yeni: ${latest})`,
  outdatedBadge: "Eski sürüm",
  driftTitle: (m, d) => `Yetenek farkları: ${m} eksik, ${d} farklı değer`,
  driftOnlyMissing: "Yalnızca eksikler",
  driftMissing: "yok",
  driftNone: "Gösterilecek fark yok.",
  colCapability: "Yetenek",
  filterMine: "Yalnızca benim işlerim",
  requestedBy: (name) => `başlatan: ${name}`,
  queuedJobs: "Bekleyen işler",
  showAllQueued: (n) => `Tümünü göster (${n})`,
  showFewerQueued: "Daha az göster",
  waiting: (d) => `${d} bekliyor`,
  colAgent: "Agent",
  colStatus: "Durum",
  colVersion: "Sürüm",
  colRunningJob: "Çalışan iş",
  colLastJob: "Son iş",
  startedAgo: (d) => `${d} önce başladı`,
  finishedAgo: (r, d) => `${r}, ${d} önce`,
  request: (id) => `İstek ${id}`,
  unknown: "Bilinmiyor",
  emptyPool: "Bu havuzda agent yok.",
  openPoolSettings: "Havuz ayarlarını aç",
  agentState: { idle: "Boşta", busy: "Çalışıyor", offline: "Offline", disabled: "Devre dışı" },
  result: {
    succeeded: "Başarılı",
    succeededWithIssues: "Uyarılı",
    failed: "Başarısız",
    canceled: "İptal",
    abandoned: "Yarıda kaldı",
  },
  reason: (r) => {
    switch (r.kind) {
      case "listError":
        return "Agent listesi okunamadı";
      case "offline":
        return `${r.count} agent offline`;
      case "queueWait":
        return `En eski iş ${formatDuration(r.seconds, tr.units)} bekliyor`;
      case "noAgent":
        return "Çalışabilir agent yok";
      case "longRunning":
        return `${r.count} iş ${formatDuration(STUCK_SEC, tr.units)} üzeri çalışıyor`;
      case "allDisabled":
        return "Tüm agent'lar devre dışı bırakılmış";
      case "stale":
        return `${r.count} iş bayat`;
    }
  },
};

const en: Strings = {
  locale: "en-US",
  units: { s: "s", m: "min", h: "h", d: "d" },
  title: "Agent Pool Health Dashboard",
  lastUpdated: (t) => `Last updated: ${t}`,
  demoData: "sample data",
  autoRefreshOn: "Auto-refresh: on",
  autoRefreshOff: "Auto-refresh: off",
  refresh: "Refresh",
  refreshing: "Refreshing…",
  loading: "Loading…",
  loadError: (d) => `Could not read agent pools (${d}). Check that you have permission to view agent pools.`,
  noPools: "There are no self-hosted agent pools you can view.",
  tileProblemPools: "Pools with problems",
  tileOfflineAgents: "Offline agents",
  tileRunning: "Running jobs",
  tileQueued: "Queued jobs",
  queueUnknownPools: (n) => `Queue unreadable for ${n} ${n === 1 ? "pool" : "pools"}`,
  inactivePoolsNote: (n) => `${n} ${n === 1 ? "pool" : "pools"} disabled`,
  staleNote: (n, d) => `${n} of them stale (waiting over ${d})`,
  staleJobs: (d) => `Stale jobs (waiting over ${d})`,
  changedAgo: (d) => `${d} ago`,
  unusedTitle: (n) => `Unused agents (${n})`,
  unusedHint: (d) => `No job in the last ${d}; candidates for removal or reuse`,
  colPool: "Pool",
  longRunning: "Running long",
  searchPlaceholder: "Search pools or agents",
  filterProblems: "Problems only",
  filterHideInactive: "Hide disabled",
  noMatches: "No pool matches the filter.",
  scopeLabel: "Pools shown",
  scope: { all: "All", automation: "Agent pools", deployment: "Deployment pools" },
  deploymentTag: "Deployment",
  oldestWaiting: (d) => `oldest waiting ${d}`,
  usageTitle: (n) => `Usage: last ${n} completed ${n === 1 ? "job" : "jobs"}`,
  usageRow: (n, d) => `${n} ${n === 1 ? "job" : "jobs"} · ${d}`,
  waitReason: (r) => {
    switch (r.kind) {
      case "noMatch":
        return r.missing.length
          ? `No matching agent; unmet demand: ${r.missing.slice(0, 3).join(", ")}`
          : "No matching agent";
      case "idle":
        return `${r.count} matching ${r.count === 1 ? "agent is" : "agents are"} idle; waiting to be assigned`;
      case "busy":
        return r.count === 1 ? "The 1 matching agent is busy" : `All ${r.count} matching agents are busy`;
      case "unavailable":
        return `Matching agents are not running (${[
          r.offline ? `${r.offline} offline` : "",
          r.disabled ? `${r.disabled} disabled` : "",
        ]
          .filter(Boolean)
          .join(", ")})`;
    }
  },
  lastJobAgo: (name, d) => `${name}, ${d} ago`,
  neverRan: (d) => `Never ran a job; registered ${d} ago`,
  noProblems: "No problems",
  statOnline: "Online",
  statRunning: "Running",
  statQueued: "Queued",
  statAvgWait: "Avg. wait",
  statOccupancy: "Occupancy",
  percent: (n) => `${n}%`,
  capabilities: (n) => `Capabilities (${n})`,
  capFilter: "Filter capabilities",
  capUser: "User-defined",
  capNone: "No matching capability.",
  exportCsv: "Export CSV",
  csvFileName: "agent-inventory",
  csvSeparator: ",",
  csvHeaders: [
    "Pool",
    "Pool type",
    "Agent",
    "Status",
    "Version",
    "Operating system",
    "Status changed",
    "Running job",
    "Last job",
    "Last job result",
    "Last job finished",
    "Days unused",
  ],
  csvPoolType: { automation: "Agent", deployment: "Deployment" },
  agentListError: (d) => `Could not read the agent list (${d}). You may not have read permission on this pool.`,
  queueUnreadable: "Could not read the job queue; queued job count and wait time are unavailable.",
  outdatedNote: (n, latest) =>
    `${n} ${n === 1 ? "agent is" : "agents are"} on an older version (newest in pool: ${latest})`,
  outdatedBadge: "Outdated",
  driftTitle: (m, d) => `Capability differences: ${m} missing, ${d} different values`,
  driftOnlyMissing: "Missing only",
  driftMissing: "missing",
  driftNone: "No differences to show.",
  colCapability: "Capability",
  filterMine: "My jobs only",
  requestedBy: (name) => `requested by ${name}`,
  queuedJobs: "Queued jobs",
  showAllQueued: (n) => `Show all (${n})`,
  showFewerQueued: "Show fewer",
  waiting: (d) => `waiting ${d}`,
  colAgent: "Agent",
  colStatus: "Status",
  colVersion: "Version",
  colRunningJob: "Running job",
  colLastJob: "Last job",
  startedAgo: (d) => `started ${d} ago`,
  finishedAgo: (r, d) => `${r}, ${d} ago`,
  request: (id) => `Request ${id}`,
  unknown: "Unknown",
  emptyPool: "This pool has no agents.",
  openPoolSettings: "Open pool settings",
  agentState: { idle: "Idle", busy: "Running", offline: "Offline", disabled: "Disabled" },
  result: {
    succeeded: "Succeeded",
    succeededWithIssues: "Succeeded with issues",
    failed: "Failed",
    canceled: "Canceled",
    abandoned: "Abandoned",
  },
  reason: (r) => {
    switch (r.kind) {
      case "listError":
        return "Could not read the agent list";
      case "offline":
        return `${r.count} ${r.count === 1 ? "agent" : "agents"} offline`;
      case "queueWait":
        return `Oldest job waiting ${formatDuration(r.seconds, en.units)}`;
      case "noAgent":
        return "No agent can run jobs";
      case "longRunning":
        return `${r.count} ${r.count === 1 ? "job" : "jobs"} running over ${formatDuration(STUCK_SEC, en.units)}`;
      case "allDisabled":
        return "All agents are disabled";
      case "stale":
        return `${r.count} stale ${r.count === 1 ? "job" : "jobs"} in queue`;
    }
  },
};

export const STRINGS: Record<Lang, Strings> = { tr, en };
