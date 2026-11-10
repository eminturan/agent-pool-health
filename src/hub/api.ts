import { Agent, AgentPool, DataSource, JobRequest, PoolData } from "./types";

// Server 2022 için 7.0. jobrequests uç noktası yalnızca preview olarak yayınlanır.
const API = "api-version=7.0";
const API_PREVIEW = "api-version=7.0-preview.1";
const COMPLETED_REQUEST_COUNT = 50;

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

      return Promise.all(
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
    },
  };
}
