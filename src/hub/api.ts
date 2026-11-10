import { Agent, AgentPool, DataSource, JobRequest, Person, PoolData } from "./types";

// Server 2022 için 7.0. jobrequests uç noktası yalnızca preview olarak yayınlanır.
const API = "api-version=7.0";
const API_PREVIEW = "api-version=7.0-preview.1";
const COMPLETED_REQUEST_COUNT = 50;
/** Tek sorguda istenen build sayısı. */
const BUILD_BATCH = 100;

interface BuildInfo {
  id: number;
  requestedFor?: { id: string; displayName?: string };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getList<T>(fetchFn: Fetch, url: string, token: string): Promise<T[]> {
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.value as T[];
}

/**
 * @param baseUrl Collection adresi, örn. https://sunucu/tfs/DefaultCollection/
 * @param getToken Extension'ın erişim token'ını döndürür.
 */
export function createRestSource(
  baseUrl: string,
  getToken: () => Promise<string>,
  fetchFn: Fetch = (u, i) => fetch(u, i),
): DataSource {
  const root = (baseUrl.endsWith("/") ? baseUrl : baseUrl + "/") + "_apis/distributedtask/pools";
  const settings = (baseUrl.endsWith("/") ? baseUrl : baseUrl + "/") + "_settings/";

  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  // Build kimliği → işi başlatan kişi. null: sorulmuş ama okunamamış; tekrar sorulmaz.
  const requesters = new Map<string, Person | null>();
  const buildKey = (r: JobRequest) =>
    r.planType?.toLowerCase() === "build" && r.scopeId && r.owner?.id ? `${r.scopeId}/${r.owner.id}` : null;

  /**
   * Bitmemiş build işlerini başlatan kişiyi okur ve işe yazar. İş kaydında bu bilgi yoktur;
   * build'ler proje bazında toplu sorgulanır (vso.build yetkisi). Okunamazsa iş sahipsiz kalır.
   */
  async function addRequesters(pools: PoolData[], token: string): Promise<void> {
    const active = pools.flatMap((p) => [
      ...(p.requests ?? []).filter((r) => !r.finishTime),
      ...p.agents.map((a) => a.assignedRequest).filter((r): r is JobRequest => !!r),
    ]);
    const wanted = new Map<string, Set<number>>();
    for (const r of active) {
      const key = buildKey(r);
      if (!key || requesters.has(key)) continue;
      requesters.set(key, null);
      wanted.set(r.scopeId!, (wanted.get(r.scopeId!) ?? new Set()).add(r.owner!.id!));
    }
    const calls: Promise<void>[] = [];
    for (const [project, idSet] of wanted) {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i += BUILD_BATCH) {
        const url = `${base}${project}/_apis/build/builds?buildIds=${ids.slice(i, i + BUILD_BATCH).join(",")}&${API}`;
        calls.push(
          getList<BuildInfo>(fetchFn, url, token)
            .then((builds) => {
              for (const b of builds) {
                if (b.requestedFor) {
                  requesters.set(`${project}/${b.id}`, {
                    id: b.requestedFor.id,
                    displayName: b.requestedFor.displayName,
                  });
                }
              }
            })
            .catch(() => undefined),
        );
      }
    }
    await Promise.all(calls);
    for (const r of active) {
      const key = buildKey(r);
      const who = key ? requesters.get(key) : null;
      if (who) r.requestedFor = who;
    }
  }

  return {
    poolUrl: (pool) =>
      pool.poolType === "deployment"
        ? `${settings}deploymentpools?poolId=${pool.id}`
        : `${settings}agentpools?poolId=${pool.id}&view=agents`,

    async load(): Promise<PoolData[]> {
      const token = await getToken();
      // Sunucu poolType verilmezse yalnızca pipeline (automation) havuzlarını döndürür; deployment
      // group havuzları ayrı sorgulanır. Deployment sorgusu başarısız olursa sayfa onlarsız çalışır.
      const [automation, deployment] = await Promise.all([
        getList<AgentPool>(fetchFn, `${root}?poolType=automation&${API}`, token),
        getList<AgentPool>(fetchFn, `${root}?poolType=deployment&${API}`, token).catch(() => [] as AgentPool[]),
      ]);
      const seen = new Set<number>();
      const pools = [...automation, ...deployment].filter((p) => {
        // Microsoft-hosted havuzlar hariç; iki sorguda da dönen havuz bir kez alınır.
        if (p.isHosted || seen.has(p.id)) return false;
        if (p.poolType !== "automation" && p.poolType !== "deployment") return false;
        seen.add(p.id);
        return true;
      });

      const data = await Promise.all(
        pools.map(async (pool): Promise<PoolData> => {
          const [agents, requests] = await Promise.all([
            getList<Agent>(
              fetchFn,
              `${root}/${pool.id}/agents?includeAssignedRequest=true&includeLastCompletedRequest=true&includeCapabilities=true&${API}`,
              token,
            ).catch((e: Error) => e),
            getList<JobRequest>(
              fetchFn,
              `${root}/${pool.id}/jobrequests?completedRequestCount=${COMPLETED_REQUEST_COUNT}&${API_PREVIEW}`,
              token,
            ).catch(() => null),
          ]);
          return agents instanceof Error
            ? { pool, agents: [], requests, error: agents.message }
            : { pool, agents, requests };
        }),
      );
      await addRequesters(data, token).catch(() => undefined);
      return data;
    },
  };
}
