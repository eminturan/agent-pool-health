import { describe, expect, it } from "vitest";
import { createRestSource } from "../src/hub/api";
import { inventoryRows, toCsv } from "../src/hub/export";
import {
  capabilityList,
  compareVersions,
  explainWait,
  filterRows,
  findUnusedAgents,
  formatDuration,
  groupQueue,
  inScope,
  occupancy,
  requestState,
  shortOs,
  sortByHealth,
  summarizeAll,
  summarizePool,
  usageByPipeline,
  waitSeconds,
} from "../src/hub/metrics";
import { firstCulture, pickLang, STRINGS } from "../src/hub/i18n";
import { Agent, JobRequest, PoolData } from "../src/hub/types";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const at = (secAgo: number) => new Date(NOW - secAgo * 1000).toISOString();

const agent = (name: string, extra: Partial<Agent> = {}): Agent => ({
  id: 1,
  name,
  version: "2.210.1",
  status: "online",
  enabled: true,
  ...extra,
});
const pool = (agents: Agent[], requests: JobRequest[] | null = [], name = "P"): PoolData => ({
  pool: { id: 1, name, size: agents.length, isHosted: false, poolType: "automation" },
  agents,
  requests,
});

describe("requestState / waitSeconds", () => {
  it("iş durumunu zaman alanlarından çıkarır", () => {
    expect(requestState({ requestId: 1, queueTime: at(10) })).toBe("queued");
    expect(requestState({ requestId: 1, queueTime: at(10), receiveTime: at(5) })).toBe("running");
    expect(requestState({ requestId: 1, queueTime: at(10), receiveTime: at(5), finishTime: at(1) })).toBe("finished");
  });

  it("bekleyen iş için şu ana kadar, başlamış iş için başlangıca kadar sayar", () => {
    expect(waitSeconds({ requestId: 1, queueTime: at(120) }, NOW)).toBe(120);
    expect(waitSeconds({ requestId: 1, queueTime: at(120), receiveTime: at(90), finishTime: at(10) }, NOW)).toBe(30);
    expect(waitSeconds({ requestId: 1 }, NOW)).toBeNull();
  });
});

describe("summarizePool", () => {
  it("sağlıklı havuzu ok sayar ve agent'ları sınıflar", () => {
    const s = summarizePool(
      pool([agent("a", { assignedRequest: { requestId: 1 } }), agent("b"), agent("c", { enabled: false })]),
      NOW,
    );
    expect(s).toMatchObject({ total: 3, online: 2, busy: 1, idle: 1, disabled: 1, offline: 0, health: "ok" });
  });

  it("offline agent varsa uyarı verir", () => {
    const s = summarizePool(pool([agent("a"), agent("b", { status: "offline" })]), NOW);
    expect(s.health).toBe("warning");
    expect(s.reasons).toEqual([{ kind: "offline", count: 1 }]);
  });

  it("çalışabilir agent yoksa kritik sayar", () => {
    const s = summarizePool(pool([agent("a", { status: "offline" }), agent("b", { enabled: false })]), NOW);
    expect(s.health).toBe("critical");
  });

  it("boş havuzu kritik saymaz", () => {
    expect(summarizePool(pool([]), NOW).health).toBe("ok");
  });

  it("kuyruk ve bekleme sürelerini hesaplar", () => {
    const s = summarizePool(
      pool(
        [agent("a")],
        [
          { requestId: 1, queueTime: at(400) },
          { requestId: 2, queueTime: at(30) },
          { requestId: 3, queueTime: at(100), receiveTime: at(90) },
          { requestId: 4, queueTime: at(1000), receiveTime: at(980), finishTime: at(900) },
          { requestId: 5, queueTime: at(2000), receiveTime: at(1960), finishTime: at(1900) },
        ],
      ),
      NOW,
    );
    expect(s).toMatchObject({ queued: 2, running: 1, oldestQueuedSec: 400, avgWaitSec: 30, health: "warning" });
  });

  it("iş istekleri okunamazsa kuyruğu bilinmiyor bırakır", () => {
    const s = summarizePool(pool([agent("a", { assignedRequest: { requestId: 1 } })], null), NOW);
    expect(s).toMatchObject({ queued: null, running: 1, avgWaitSec: null, health: "ok" });
  });

  it("sürümleri sayısal sıralar", () => {
    const s = summarizePool(pool([agent("a", { version: "2.210.1" }), agent("b", { version: "2.95.0" })]), NOW);
    expect(s.versions).toEqual(["2.95.0", "2.210.1"]);
    expect(compareVersions("3.0", "2.999.9")).toBeGreaterThan(0);
  });
});

const DAY = 86400;

describe("devre dışı havuz ve bayat işler", () => {
  it("tüm agent'ları devre dışı olan havuzu kritik değil devre dışı sayar", () => {
    const s = summarizePool(pool([agent("a", { enabled: false }), agent("b", { enabled: false, status: "offline" })]), NOW);
    expect(s.health).toBe("inactive");
    expect(s.reasons).toEqual([{ kind: "allDisabled" }]);
  });

  it("devre dışı havuzda güncel bekleyen iş varsa kritik sayar", () => {
    const s = summarizePool(pool([agent("a", { enabled: false })], [{ requestId: 1, queueTime: at(60) }]), NOW);
    expect(s.health).toBe("critical");
    expect(s.reasons).toEqual([{ kind: "noAgent" }]);
  });

  it("bir günden eski işleri kuyrukta sayar ama sağlığı etkiletmez", () => {
    const s = summarizePool(
      pool(
        [agent("a")],
        [
          { requestId: 1, queueTime: at(204 * DAY) },
          { requestId: 2, queueTime: at(2 * DAY) },
          { requestId: 3, queueTime: at(120) },
        ],
      ),
      NOW,
    );
    expect(s).toMatchObject({ queued: 3, stale: 2, oldestQueuedSec: 120, health: "ok" });
    expect(s.reasons).toEqual([{ kind: "stale", count: 2 }]);
  });

  it("yalnızca bayat işi olan devre dışı havuz devre dışı kalır; sıralamada en alta gider", () => {
    const rows = [
      pool([agent("a", { enabled: false })], [{ requestId: 1, queueTime: at(30 * DAY) }], "Kapalı"),
      pool([agent("a")], [], "Sağlam"),
    ].map((data) => ({ data, summary: summarizePool(data, NOW) }));
    expect(rows[0].summary.health).toBe("inactive");
    expect(sortByHealth(rows).map((r) => r.data.pool.name)).toEqual(["Sağlam", "Kapalı"]);
    expect(summarizeAll(rows.map((r) => r.summary))).toMatchObject({ problemPools: 0, inactivePools: 1, stale: 1, queued: 1 });
  });
});

describe("kullanılmayan agent'lar", () => {
  it("90 günden uzun süredir iş almamış agent'ları en eskisi üstte listeler", () => {
    const data = pool([
      agent("yeni", { lastCompletedRequest: { requestId: 1, finishTime: at(10 * DAY) } }),
      agent("eski", { lastCompletedRequest: { requestId: 2, finishTime: at(843 * DAY) } }),
      agent("hic", { createdOn: at(200 * DAY) }),
      agent("yeni-kayit", { createdOn: at(5 * DAY) }),
      agent("bilinmiyor"),
      agent("calisiyor", {
        assignedRequest: { requestId: 3 },
        lastCompletedRequest: { requestId: 4, finishTime: at(300 * DAY) },
      }),
    ]);
    const unused = findUnusedAgents([data], NOW);
    expect(unused.map((u) => [u.agent.name, u.neverRan, u.idleSec])).toEqual([
      ["eski", false, 843 * DAY],
      ["hic", true, 200 * DAY],
    ]);
  });
});

describe("bu iş neden bekliyor", () => {
  const win = (name: string, id: number, extra: Partial<Agent> = {}) =>
    agent(name, { id, systemCapabilities: { "Agent.OS": "Windows_NT", "Agent.Version": "2.210.1", msbuild: "x" }, ...extra });
  const agents = [
    win("bos", 1),
    win("mesgul", 2, { assignedRequest: { requestId: 9 } }),
    win("kopuk", 3, { status: "offline" }),
    win("kapali", 4, { enabled: false }),
  ];

  it("hiçbir agent isteği karşılamıyorsa eksik istekleri söyler", () => {
    expect(explainWait({ requestId: 1, demands: ["msbuild", "xcode", "Agent.OS -equals Darwin"] }, agents)).toEqual({
      kind: "noMatch",
      missing: ["xcode", "Agent.OS -equals Darwin"],
    });
    expect(explainWait({ requestId: 1 }, [])).toEqual({ kind: "noMatch", missing: [] });
  });

  it("uygun agent'ların durumuna göre nedeni seçer", () => {
    expect(explainWait({ requestId: 1, demands: ["MSBuild", "agent.os -equals windows_nt"] }, agents)).toEqual({
      kind: "idle",
      count: 1,
    });
    expect(explainWait({ requestId: 1 }, agents.slice(1))).toEqual({ kind: "busy", count: 1 });
    expect(explainWait({ requestId: 1 }, agents.slice(2))).toEqual({ kind: "unavailable", offline: 1, disabled: 1 });
  });

  it("sürüm isteğini karşılaştırır ve sunucunun eşleştirdiği agent'lara öncelik verir", () => {
    expect(explainWait({ requestId: 1, demands: ["Agent.Version -gtVersion 2.300.0"] }, agents).kind).toBe("noMatch");
    expect(explainWait({ requestId: 1, demands: ["Agent.Version -gtVersion 2.163.1"] }, agents).kind).toBe("idle");
    expect(explainWait({ requestId: 1, demands: ["xcode"], matchedAgents: [{ id: 2 }] }, agents)).toEqual({
      kind: "busy",
      count: 1,
    });
  });

  it("yetenek listesi gelmeyen agent'ı uygun sayar", () => {
    expect(explainWait({ requestId: 1, demands: ["xcode"] }, [agent("a")])).toEqual({ kind: "idle", count: 1 });
  });

  it("nedeni iki dilde yazar", () => {
    const { tr, en } = STRINGS;
    expect(tr.waitReason({ kind: "noMatch", missing: ["xcode"] })).toBe("Uygun agent yok; karşılanmayan istek: xcode");
    expect(en.waitReason({ kind: "busy", count: 3 })).toBe("All 3 matching agents are busy");
    expect(tr.waitReason({ kind: "unavailable", offline: 2, disabled: 0 })).toBe("Uygun agent'lar çalışmıyor (2 offline)");
    expect(en.waitReason({ kind: "idle", count: 1 })).toBe("1 matching agent is idle; waiting to be assigned");
  });
});

describe("takılmış iş", () => {
  it("bir saatten uzun çalışan iş havuzu uyarıya çeker", () => {
    const s = summarizePool(
      pool([
        agent("a", { assignedRequest: { requestId: 1, receiveTime: at(3700) } }),
        agent("b", { assignedRequest: { requestId: 2, receiveTime: at(600) } }),
      ]),
      NOW,
    );
    expect(s).toMatchObject({ longRunning: 1, health: "warning" });
    expect(s.reasons).toEqual([{ kind: "longRunning", count: 1 }]);
    expect(STRINGS.tr.reason(s.reasons[0])).toBe("1 iş 1 sa üzeri çalışıyor");
    expect(STRINGS.en.reason(s.reasons[0])).toBe("1 job running over 1 h");
  });
});

describe("filtre", () => {
  const rows = [
    pool([agent("BLD-01")], [], "Default"),
    pool([agent("MAC-07", { status: "offline" }), agent("MAC-08")], [], "Mobil"),
    pool([agent("OLD-01", { enabled: false })], [], "Eski"),
    { ...pool([agent("APP-01")], [], "Sunucular"), pool: { id: 9, name: "Sunucular", size: 1, isHosted: false, poolType: "deployment" } },
  ].map((data) => ({ data, summary: summarizePool(data, NOW) }));
  const names = (f: Partial<Parameters<typeof filterRows>[1]>) =>
    filterRows(rows, { query: "", onlyProblems: false, hideInactive: false, ...f }).map((r) => r.data.pool.name);

  it("havuz ya da agent adına göre arar", () => {
    expect(names({})).toEqual(["Default", "Mobil", "Eski", "Sunucular"]);
    expect(names({ query: " mob " })).toEqual(["Mobil"]);
    expect(names({ query: "bld-0" })).toEqual(["Default"]);
    expect(names({ query: "yok" })).toEqual([]);
  });

  it("yalnızca sorunluları gösterir, devre dışıları gizler", () => {
    expect(names({ onlyProblems: true })).toEqual(["Mobil"]);
    expect(names({ hideInactive: true })).toEqual(["Default", "Mobil", "Sunucular"]);
  });

  it("kapsam seçimi havuzları türüne göre ayırır", () => {
    const pick = (scope: "all" | "automation" | "deployment") =>
      rows.filter((r) => inScope(r.data, scope)).map((r) => r.data.pool.name);
    expect(pick("all")).toEqual(["Default", "Mobil", "Eski", "Sunucular"]);
    expect(pick("automation")).toEqual(["Default", "Mobil", "Eski"]);
    expect(pick("deployment")).toEqual(["Sunucular"]);
  });
});

describe("kuyruğu pipeline'a göre gruplama", () => {
  it("aynı pipeline'ın işlerini birleştirir; kalabalık grup üstte, grupta en eski başta", () => {
    const q = (id: number, name: string | undefined, secAgo: number): JobRequest => ({
      requestId: id,
      queueTime: at(secAgo),
      definition: name ? { name } : undefined,
    });
    const groups = groupQueue([q(1, "A", 100), q(2, "B", 900), q(3, "A", 300), q(4, undefined, 50), q(5, "A", 200), q(6, undefined, 60)], NOW);
    expect(groups.map((g) => [g.name, g.jobs.map((j) => j.requestId), g.oldestSec])).toEqual([
      ["A", [3, 5, 1], 300],
      ["B", [2], 900],
      [undefined, [6], 60],
      [undefined, [4], 50],
    ]);
  });
});

describe("kullanım kırılımı", () => {
  it("tamamlanan işleri pipeline'a göre toplar; en çok süre harcayan üstte", () => {
    const fin = (id: number, name: string, ranSec: number): JobRequest => ({
      requestId: id,
      queueTime: at(5000),
      receiveTime: at(1000 + ranSec),
      finishTime: at(1000),
      definition: { name },
    });
    const usage = usageByPipeline([
      fin(1, "CI", 100),
      fin(2, "Release", 900),
      fin(3, "CI", 200),
      { requestId: 4, queueTime: at(10), definition: { name: "CI" } },
      { requestId: 5, queueTime: at(10), receiveTime: at(5), definition: { name: "Release" } },
    ]);
    expect(usage).toEqual([
      { name: "Release", count: 1, totalSec: 900 },
      { name: "CI", count: 2, totalSec: 300 },
    ]);
  });
});

describe("doluluk oranı", () => {
  it("online agent'ların meşgul yüzdesini verir; online yoksa null", () => {
    const busy = { assignedRequest: { requestId: 1 } };
    expect(occupancy(summarizePool(pool([agent("a", busy), agent("b"), agent("c"), agent("d", { status: "offline" })]), NOW))).toBe(33);
    expect(occupancy(summarizePool(pool([agent("a", busy), agent("b", busy)]), NOW))).toBe(100);
    expect(occupancy(summarizePool(pool([agent("a", { status: "offline" })]), NOW))).toBeNull();
  });
});

describe("agent yetenekleri", () => {
  it("kullanıcı tanımlıları önce, grupları ada göre sıralar", () => {
    const list = capabilityList(
      agent("a", { systemCapabilities: { msbuild: "x", "Agent.OS": "Windows_NT" }, userCapabilities: { ekip: "kredi" } }),
    );
    expect(list).toEqual([
      { name: "ekip", value: "kredi", user: true },
      { name: "Agent.OS", value: "Windows_NT", user: false },
      { name: "msbuild", value: "x", user: false },
    ]);
    expect(capabilityList(agent("b"))).toEqual([]);
  });
});

describe("CSV dışa aktarma", () => {
  it("ayraç, tırnak ya da satır sonu içeren hücreyi tırnaklar", () => {
    expect(toCsv([["a", "b;c", 'd"e'], ["x\ny", "", "z"]], ";")).toBe('a;"b;c";"d""e"\r\n"x\ny";;z');
    expect(toCsv([["b;c", "d,e"]], ",")).toBe('b;c,"d,e"');
  });

  it("her agent için bir envanter satırı üretir", () => {
    const data = pool(
      [
        agent("a", {
          id: 1,
          osDescription: "Darwin 25.3.0 Darwin Kernel Version 25.3.0: x",
          assignedRequest: { requestId: 7, definition: { name: "CI" } },
        }),
        agent("b", {
          id: 2,
          enabled: false,
          statusChangedOn: at(100),
          lastCompletedRequest: { requestId: 8, result: "failed", finishTime: at(100 * DAY) },
        }),
      ],
      [],
      "Havuz",
    );
    const rows = inventoryRows([data], NOW, STRINGS.tr);
    expect(rows[0]).toEqual(STRINGS.tr.csvHeaders);
    expect(rows[1]).toEqual(["Havuz", "Agent", "a", "Çalışıyor", "2.210.1", "macOS (Darwin 25.3)", "", "CI", "", "", "", ""]);
    expect(rows[2]).toEqual([
      "Havuz", "Agent", "b", "Devre dışı", "2.210.1", "", at(100), "", "İstek 8", "Başarısız", at(100 * DAY), "100",
    ]);
    expect(inventoryRows([data], NOW, STRINGS.en)[2][3]).toBe("Disabled");
    expect(STRINGS.en.csvHeaders).toHaveLength(STRINGS.tr.csvHeaders.length);
  });
});

describe("shortOs", () => {
  it("uzun işletim sistemi satırını kısaltır", () => {
    expect(
      shortOs("Darwin 25.3.0 Darwin Kernel Version 25.3.0: Wed Jan 28 20:55:08 PST 2026; root:xnu-12377.91.3~2/RELEASE_ARM64_T6020"),
    ).toBe("macOS (Darwin 25.3)");
    expect(shortOs("Linux 5.10.16.3-microsoft-standard-WSL2 #1 SMP Fri Apr 2 22:23:49 UTC 2021")).toBe(
      "Linux 5.10.16.3-microsoft-standard-WSL2",
    );
    expect(shortOs("Microsoft Windows 10.0.17763")).toBe("Microsoft Windows 10.0.17763");
    expect(shortOs("x".repeat(80))).toHaveLength(60);
  });
});

describe("toplamlar ve sıralama", () => {
  it("toplar ve sorunlu havuzları üste alır", () => {
    const rows = [
      pool([agent("a")], [], "Zeta"),
      pool([agent("a", { status: "offline" })], [{ requestId: 1, queueTime: at(5) }], "Kritik"),
      pool([agent("a"), agent("b", { status: "offline" })], null, "Uyarı"),
      pool([agent("a")], [], "Alfa"),
    ].map((data) => ({ data, summary: summarizePool(data, NOW) }));

    expect(sortByHealth(rows).map((r) => r.data.pool.name)).toEqual(["Kritik", "Uyarı", "Alfa", "Zeta"]);
    expect(summarizeAll(rows.map((r) => r.summary))).toEqual({
      pools: 4,
      agents: 5,
      offline: 2,
      running: 0,
      queued: 1,
      stale: 0,
      queueUnknownPools: 1,
      problemPools: 2,
      inactivePools: 0,
    });
  });
});

describe("dil", () => {
  it("Azure DevOps kültüründen dili seçer; Türkçe dışı her şey İngilizce olur", () => {
    expect(pickLang("tr-TR")).toBe("tr");
    expect(pickLang("TR")).toBe("tr");
    expect(pickLang("en-US")).toBe("en");
    expect(pickLang("de-DE")).toBe("en");
    expect(pickLang(undefined)).toBe("en");
  });

  it("hata fırlatan ya da boş dönen dil kaynağını atlar", () => {
    const broken = () => {
      throw new Error("Attempted to call getPageContext() before init() was complete.");
    };
    expect(firstCulture([broken, () => "", () => "tr-TR", () => "en-US"])).toBe("tr-TR");
    expect(firstCulture([() => "en-US", broken])).toBe("en-US");
    expect(firstCulture([broken, () => undefined])).toBeUndefined();
  });

  it("süreyi iki dilde yazar", () => {
    const { tr, en } = STRINGS;
    expect(formatDuration(45, tr.units)).toBe("45 sn");
    expect(formatDuration(185, tr.units)).toBe("3 dk 5 sn");
    expect(formatDuration(7800, tr.units)).toBe("2 sa 10 dk");
    expect(formatDuration(90000, tr.units)).toBe("1 gün 1 sa");
    expect(formatDuration(185, en.units)).toBe("3 min 5 s");
    expect(formatDuration(90000, en.units)).toBe("1 d 1 h");
  });

  it("sorun nedenlerini iki dilde yazar", () => {
    const { tr, en } = STRINGS;
    expect(tr.reason({ kind: "offline", count: 2 })).toBe("2 agent offline");
    expect(en.reason({ kind: "offline", count: 1 })).toBe("1 agent offline");
    expect(en.reason({ kind: "offline", count: 2 })).toBe("2 agents offline");
    expect(tr.reason({ kind: "queueWait", seconds: 1320 })).toBe("En eski iş 22 dk bekliyor");
    expect(en.reason({ kind: "queueWait", seconds: 1320 })).toBe("Oldest job waiting 22 min");
    expect(tr.reason({ kind: "stale", count: 877 })).toBe("877 iş bayat");
    expect(en.reason({ kind: "stale", count: 1 })).toBe("1 stale job in queue");
    expect(en.reason({ kind: "allDisabled" })).toBe("All agents are disabled");
  });

  it("iki sözlükte aynı anahtarlar var", () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.tr).sort());
    expect(Object.keys(STRINGS.en.result).sort()).toEqual(Object.keys(STRINGS.tr.result).sort());
  });
});

describe("createRestSource", () => {
  const json = (value: unknown, status = 200) =>
    ({ ok: status < 400, status, json: async () => ({ value }) }) as Response;

  it("self-hosted pipeline ve deployment havuzlarını okur, hataları havuz bazında tutar", async () => {
    const calls: string[] = [];
    const source = createRestSource(
      "https://srv/tfs/Col",
      async () => "tkn",
      async (url, init) => {
        calls.push(url);
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tkn");
        // Gerçek sunucu gibi: poolType=automation yalnızca pipeline havuzlarını döndürür.
        if (url.includes("/pools?poolType=automation"))
          return json([
            { id: 1, name: "A", poolType: "automation", isHosted: false },
            { id: 3, name: "Hosted", poolType: "automation", isHosted: true },
            { id: 4, name: "B", poolType: "automation", isHosted: false },
          ]);
        if (url.includes("/pools?poolType=deployment"))
          return json([
            { id: 2, name: "Dep", poolType: "deployment", isHosted: false },
            { id: 4, name: "B", poolType: "automation", isHosted: false },
          ]);
        if (url.includes("/pools/1/agents")) return json([agent("a")]);
        if (url.includes("/pools/1/jobrequests")) return json([{ requestId: 9 }]);
        return json(null, 403);
      },
    );

    const data = await source.load();
    expect(data.map((d) => d.pool.name)).toEqual(["A", "B", "Dep"]);
    expect(data[0]).toMatchObject({ agents: [{ name: "a" }], requests: [{ requestId: 9 }] });
    expect(data[1]).toMatchObject({ agents: [], requests: null, error: "HTTP 403" });
    expect(calls.slice(0, 2)).toEqual([
      "https://srv/tfs/Col/_apis/distributedtask/pools?poolType=automation&api-version=7.0",
      "https://srv/tfs/Col/_apis/distributedtask/pools?poolType=deployment&api-version=7.0",
    ]);
    expect(source.poolUrl!(data[1].pool)).toBe("https://srv/tfs/Col/_settings/agentpools?poolId=4&view=agents");
    expect(source.poolUrl!(data[2].pool)).toBe("https://srv/tfs/Col/_settings/deploymentpools?poolId=2");
  });

  it("deployment sorgusu başarısız olursa pipeline havuzlarıyla devam eder", async () => {
    const source = createRestSource("https://srv/tfs/Col/", async () => "tkn", async (url) => {
      if (url.includes("/pools?poolType=automation"))
        return json([{ id: 1, name: "A", poolType: "automation", isHosted: false }]);
      if (url.includes("/pools?poolType=deployment")) return json(null, 403);
      return json([]);
    });
    expect((await source.load()).map((d) => d.pool.name)).toEqual(["A"]);
  });
});
