import { Strings } from "./i18n";
import { agentState, findUnusedAgents, shortOs } from "./metrics";
import { PoolData } from "./types";

/**
 * Hücreleri CSV satırlarına çevirir; ayraç, tırnak ya da satır sonu içeren hücre tırnaklanır.
 * Pipeline ve agent adlarını kullanıcılar belirler: =, +, -, @ ile başlayan hücreyi Excel formül
 * olarak çalıştırır. Böyle hücrelerin başına tek tırnak eklenir, böylece düz metin kalır.
 */
export function toCsv(rows: string[][], separator: string): string {
  const cell = (raw: string) => {
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return value.includes(separator) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return rows.map((row) => row.map(cell).join(separator)).join("\r\n");
}

/** Agent envanteri: her agent bir satır; başlıklar ve durum metinleri etkin dilde. */
export function inventoryRows(pools: PoolData[], now: number, t: Strings): string[][] {
  const idleDays = new Map(
    findUnusedAgents(pools, now).map((u) => [`${u.pool.id}-${u.agent.id}`, Math.floor(u.idleSec / 86400)]),
  );
  const rows = [t.csvHeaders];
  for (const { pool, agents } of pools) {
    for (const agent of agents) {
      const job = agent.assignedRequest;
      const last = agent.lastCompletedRequest;
      const unused = idleDays.get(`${pool.id}-${agent.id}`);
      rows.push([
        pool.name,
        pool.poolType === "deployment" ? t.csvPoolType.deployment : t.csvPoolType.automation,
        agent.name,
        t.agentState[agentState(agent)],
        agent.version,
        agent.osDescription ? shortOs(agent.osDescription) : "",
        agent.statusChangedOn ?? "",
        job ? (job.definition?.name ?? t.request(job.requestId)) : "",
        last ? (last.definition?.name ?? t.request(last.requestId)) : "",
        last?.result ? (t.result[last.result] ?? last.result) : "",
        last?.finishTime ?? "",
        unused === undefined ? "" : String(unused),
      ]);
    }
  }
  return rows;
}
