// Azure DevOps distributedtask REST API'sinden kullandığımız alanlar.

export interface AgentPool {
  id: number;
  name: string;
  size: number;
  isHosted: boolean;
  poolType: string; // "automation" | "deployment"
}

export interface Person {
  id: string;
  displayName?: string;
}

export interface WebLink {
  web?: { href?: string };
}

export interface JobRequest {
  requestId: number;
  queueTime?: string;
  assignTime?: string;
  receiveTime?: string;
  finishTime?: string;
  result?: string; // "succeeded" | "failed" | "canceled" ...
  /** Pipeline tanımı. */
  definition?: { name?: string; _links?: WebLink };
  /** İşi başlatan çalıştırma (build/release). */
  owner?: { id?: number; name?: string; _links?: WebLink };
  /** "Build" ya da "Release". */
  planType?: string;
  /** İşin ait olduğu projenin kimliği. */
  scopeId?: string;
  /** İşi başlatan kişi; sunucudan ayrıca okunur (yalnızca build işleri için). */
  requestedFor?: Person;
  reservedAgent?: { id: number; name: string };
  /** İşin agent'tan istediği yetenekler, örn. "msbuild" ya da "Agent.OS -equals Darwin". */
  demands?: string[];
  /** Sunucunun bu işi çalıştırabilir bulduğu agent'lar. */
  matchedAgents?: { id: number; name?: string }[];
}

export interface Agent {
  id: number;
  name: string;
  version: string;
  status: "online" | "offline";
  enabled: boolean;
  osDescription?: string;
  /** Agent'ın kaydedildiği an. */
  createdOn?: string;
  /** Online/offline durumunun son değiştiği an. */
  statusChangedOn?: string;
  /** Yalnızca includeCapabilities=true ile gelir. */
  systemCapabilities?: Record<string, string>;
  userCapabilities?: Record<string, string>;
  assignedRequest?: JobRequest;
  lastCompletedRequest?: JobRequest;
}

export interface PoolData {
  pool: AgentPool;
  agents: Agent[];
  /** null: iş istekleri okunamadı (yetki yok veya API desteklenmiyor). */
  requests: JobRequest[] | null;
  /** Agent listesi okunamadıysa hata metni. */
  error?: string;
}

export interface DataSource {
  /** Sayfayı açan kullanıcı; "yalnızca benim işlerim" filtresi için. */
  currentUser?: Person;
  /** Havuz ayar sayfasının adresi; yoksa bağlantı gösterilmez. */
  poolUrl?(pool: AgentPool): string;
  load(): Promise<PoolData[]>;
}
