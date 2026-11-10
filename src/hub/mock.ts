import { Agent, DataSource, JobRequest, Person, PoolData } from "./types";

// `npm run dev` ile Azure DevOps dışında açıldığında kullanılan örnek veri.

const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();

const DAY = 86400;

// Sayfayı açan örnek kullanıcı ve bir başka geliştirici.
const ME: Person = { id: "ornek-ben", displayName: "Emin Turan" };
const OTHER: Person = { id: "ornek-diger", displayName: "Ayşe Yılmaz" };
const by = (r: JobRequest, who: Person): JobRequest => ({ ...r, requestedFor: who });

let nextId = 1;
const done = (name: string, finishedAgo: number, wait: number, result = "succeeded"): JobRequest => ({
  requestId: nextId++,
  queueTime: ago(finishedAgo + 240 + wait),
  assignTime: ago(finishedAgo + 240),
  receiveTime: ago(finishedAgo + 240),
  finishTime: ago(finishedAgo),
  result,
  definition: { name },
});
// Örnek bağlantı; gerçek veride pipeline çalıştırmasının adresi gelir.
const link = (name: string) => ({ web: { href: `#ornek-calistirma/${name}` } });
const running = (name: string, startedAgo: number, agent: string): JobRequest => ({
  requestId: nextId++,
  queueTime: ago(startedAgo + 20),
  assignTime: ago(startedAgo),
  receiveTime: ago(startedAgo),
  definition: { name },
  owner: { _links: link(name) },
  reservedAgent: { id: 0, name: agent },
});
const queued = (name: string, waitingFor: number, demands?: string[]): JobRequest => ({
  requestId: nextId++,
  queueTime: ago(waitingFor),
  definition: { name },
  owner: { _links: link(name) },
  demands,
});
const agent = (name: string, version: string, extra: Partial<Agent> = {}): Agent => ({
  id: nextId++,
  name,
  version,
  status: "online",
  enabled: true,
  osDescription: "Microsoft Windows Server 2019",
  systemCapabilities: { "Agent.OS": "Windows_NT", "Agent.Version": version, msbuild: "C:\\MSBuild" },
  ...extra,
});

function build(): PoolData[] {
  // Üç saattir çalışan iş: "Uzun sürüyor" olarak işaretlenir.
  const r1 = running("KrediBasvuru-CI", 3 * 3600 + 380, "BLD-WIN-01");
  const r2 = by(running("MobilBankacilik-CI", 95, "BLD-WIN-02"), ME);
  return [
    {
      pool: { id: 1, name: "Default", size: 4, isHosted: false, poolType: "automation" },
      agents: [
        agent("BLD-WIN-01", "2.210.1", { assignedRequest: r1 }),
        agent("BLD-WIN-02", "2.210.1", { assignedRequest: r2 }),
        agent("BLD-WIN-03", "2.210.1", {
          userCapabilities: { "SonarScanner": "5.0", "ekip": "kredi" }, lastCompletedRequest: done("HesapServisi-CI", 600, 12) }),
        agent("BLD-WIN-04", "2.195.0", {
          status: "offline",
          statusChangedOn: ago(90000),
          lastCompletedRequest: done("OdemeServisi-CI", 90000, 30, "failed"),
        }),
      ],
      requests: [
        r1,
        r2,
        // Hiçbir agent'ın karşılamadığı istek ve boşta uygun agent'ı olan iş.
        by(queued("Mobil-iOS-CI", 240, ["xcode", "Agent.OS -equals Darwin"]), OTHER),
        by(queued("Portal-CI", 15, ["msbuild"]), ME),
        done("HesapServisi-CI", 600, 12), done("OdemeServisi-CI", 1500, 45), done("Portal-CI", 2400, 8)],
    },
    {
      pool: { id: 2, name: "Linux-Docker", size: 2, isHosted: false, poolType: "automation" },
      agents: [
        agent("BLD-LNX-01", "2.210.1", {
          status: "offline",
          statusChangedOn: ago(1500),
          osDescription: "Linux 4.18.0-372.el8.x86_64 #1 SMP Tue Mar 8 12:56:54 EST 2022",
        }),
        agent("BLD-LNX-02", "2.210.1", {
          status: "offline",
          statusChangedOn: ago(3 * DAY),
          osDescription: "Linux 4.18.0-372.el8.x86_64 #1 SMP Tue Mar 8 12:56:54 EST 2022",
        }),
      ],
      requests: [
        by(queued("ApiGateway-CI", 1320), ME),
        queued("Bildirim-CI", 410),
        // Aynı pipeline'ın 30 işi: kuyrukta tek satırda "× 30" olarak gruplanır.
        ...Array.from({ length: 30 }, (_, i) => queued("Gece-Testi", 390 - i * 10)),
        // Bayat işler: bir günden eski, ayrı ve kapalı listelenir.
        ...Array.from({ length: 14 }, (_, i) => queued("Eski-Regresyon", (40 + i) * DAY)),
        done("ApiGateway-CI", 7200, 20),
      ],
    },
    {
      pool: { id: 3, name: "Prod-Deploy", size: 2, isHosted: false, poolType: "automation" },
      agents: [
        agent("DEP-PRD-01", "2.210.1", { lastCompletedRequest: done("KrediBasvuru-Release", 5400, 5) }),
        agent("DEP-PRD-02", "2.210.1", { enabled: false }),
      ],
      requests: [done("KrediBasvuru-Release", 5400, 5)],
    },
    {
      pool: { id: 4, name: "Test-Otomasyon", size: 1, isHosted: false, poolType: "automation" },
      agents: [agent("TST-WIN-01", "2.210.1")],
      requests: null,
    },
    {
      // Deployment group havuzu: aynı kurallarla gösterilir, "Deployment" etiketi alır.
      pool: { id: 6, name: "Prod-Sunucular", size: 2, isHosted: false, poolType: "deployment" },
      agents: [
        agent("APP-PRD-01", "2.210.1", { lastCompletedRequest: done("Portal-Release", 9000, 4) }),
        agent("APP-PRD-02", "2.210.1", { lastCompletedRequest: done("Portal-Release", 9100, 6) }),
      ],
      requests: [done("Portal-Release", 9000, 4), done("Portal-Release", 9100, 6), done("Odeme-Release", 40000, 3)],
    },
    {
      // Tüm agent'ları bilerek kapatılmış havuz: kritik değil "devre dışı" görünür.
      pool: { id: 5, name: "Eski-Mac", size: 2, isHosted: false, poolType: "automation" },
      agents: [
        agent("MACMINI-01", "3.220.1", {
          enabled: false,
          osDescription:
            "Darwin 23.4.0 Darwin Kernel Version 23.4.0: Fri Mar 15 00:12:49 PDT 2024; root:xnu-10063.101.17~1/RELEASE_ARM64_T6020",
          lastCompletedRequest: done("Mobil-iOS-CI", 240 * DAY, 15, "canceled"),
        }),
        agent("MACMINI-02", "3.220.1", {
          enabled: false,
          osDescription:
            "Darwin 23.4.0 Darwin Kernel Version 23.4.0: Fri Mar 15 00:12:49 PDT 2024; root:xnu-10063.101.17~1/RELEASE_ARM64_T6020",
          createdOn: ago(400 * DAY),
        }),
      ],
      // Havuz kapalı olsa da kuyrukta kalan eski işler sayılır.
      requests: Array.from({ length: 6 }, (_, i) => queued("Mobil-iOS-Gece", (200 + i) * DAY)),
    },
  ];
}

export const mockSource: DataSource = {
  currentUser: ME,
  load: () => new Promise((resolve) => setTimeout(() => resolve(build()), 300)),
};
