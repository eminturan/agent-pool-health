import "azure-devops-ui/Core/override.css";
import "./hub.css";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService } from "azure-devops-extension-api/Common/CommonServices";
import { Card } from "azure-devops-ui/Card";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { IHeaderCommandBarItem } from "azure-devops-ui/HeaderCommandBar";
import { MessageCard, MessageCardSeverity } from "azure-devops-ui/MessageCard";
import { Page } from "azure-devops-ui/Page";
import { Status, Statuses, StatusSize } from "azure-devops-ui/Status";

import { createRestSource } from "./api";
import { inventoryRows, toCsv } from "./export";
import {
  agentState,
  Capability,
  capabilityDrift,
  capabilityList,
  explainWait,
  filterRows,
  findUnusedAgents,
  formatDuration,
  groupQueue,
  Health,
  inScope,
  isLongRunning,
  isOutdated,
  isStaleRequest,
  latestVersion,
  occupancy,
  PoolScope,
  PoolSummary,
  QueueGroup,
  requestState,
  shortOs,
  sortByHealth,
  STALE_SEC,
  summarizeAll,
  summarizePool,
  UNUSED_SEC,
  UnusedAgent,
  usageByPipeline,
  waitSeconds,
} from "./metrics";
import { firstCulture, pickLang, Strings, STRINGS } from "./i18n";
import { mockSource } from "./mock";
import { Agent, DataSource, JobRequest, PoolData } from "./types";

const REFRESH_MS = 30_000;
/** Bir havuzda varsayılan olarak gösterilen bekleyen iş sayısı. */
const QUEUE_PREVIEW = 10;

const HEALTH_STATUS = {
  ok: Statuses.Success,
  warning: Statuses.Warning,
  critical: Statuses.Failed,
  inactive: Statuses.Skipped,
};

/** Etkin dilin metinleri; start() içinde bir kez belirlenir. */
const I18n = React.createContext<Strings>(STRINGS.en);
const useStrings = () => React.useContext(I18n);

const since = (iso: string | undefined, now: number, t: Strings) =>
  iso ? formatDuration(Math.max(0, Math.round((now - Date.parse(iso)) / 1000)), t.units) : "";

function Tile(props: { label: string; value: React.ReactNode; tone?: Exclude<Health, "inactive">; note?: string }) {
  return (
    <div className={`aph-tile aph-tone-${props.tone ?? "ok"}`}>
      <div className="aph-tile-value">{props.value}</div>
      <div className="aph-tile-label">{props.label}</div>
      {props.note && <div className="aph-tile-note">{props.note}</div>}
    </div>
  );
}

/** İş adı; sunucu bağlantı verdiyse pipeline çalıştırmasına (yoksa tanımına) gider. */
function JobName({ job, label }: { job: JobRequest; label?: string }) {
  const t = useStrings();
  const name = label ?? job.definition?.name ?? t.request(job.requestId);
  const href = job.owner?._links?.web?.href ?? job.definition?._links?.web?.href;
  return href ? (
    <a className="aph-joblink" href={href} target="_blank" rel="noopener noreferrer">
      {name}
    </a>
  ) : (
    <>{name}</>
  );
}

/** Agent'ın yetenekleri: aranabilir, kendi içinde kayan liste. */
function CapabilityList({ caps }: { caps: Capability[] }) {
  const t = useStrings();
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? caps.filter((c) => `${c.name} ${c.value}`.toLowerCase().includes(q)) : caps;
  return (
    <div className="aph-caps">
      <input
        className="aph-search"
        type="search"
        value={query}
        placeholder={t.capFilter}
        aria-label={t.capFilter}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.length === 0 && <div className="aph-muted">{t.capNone}</div>}
      <dl className="aph-caps-list">
        {shown.map((c) => (
          <React.Fragment key={`${c.user}-${c.name}`}>
            <dt>
              {c.name}
              {c.user && <span className="aph-badge aph-badge-busy aph-pool-tag">{t.capUser}</span>}
            </dt>
            <dd>{c.value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

function AgentRow({ agent, now, latest }: { agent: Agent; now: number; latest: string | null }) {
  const t = useStrings();
  const [showCaps, setShowCaps] = React.useState(false);
  const state = agentState(agent);
  const job = agent.assignedRequest;
  const last = agent.lastCompletedRequest;
  const caps = capabilityList(agent);
  return (
    <>
    <tr>
      <td>
        <div>{agent.name}</div>
        {agent.osDescription && (
          <div className="aph-muted" title={agent.osDescription}>
            {shortOs(agent.osDescription)}
          </div>
        )}
        {caps.length > 0 && (
          <button className="aph-more" aria-expanded={showCaps} onClick={() => setShowCaps(!showCaps)}>
            {t.capabilities(caps.length)} {showCaps ? "▾" : "▸"}
          </button>
        )}
      </td>
      <td>
        <span className={`aph-badge aph-badge-${state}`}>{t.agentState[state]}</span>
        {state === "offline" && agent.statusChangedOn && (
          <div className="aph-muted aph-badge-note">{t.changedAgo(since(agent.statusChangedOn, now, t))}</div>
        )}
      </td>
      <td>
        <div>{agent.version}</div>
        {isOutdated(agent, latest) && <span className="aph-badge aph-badge-warning">{t.outdatedBadge}</span>}
      </td>
      <td>
        {job ? (
          <>
            <div>
              <JobName job={job} />
            </div>
            <div className="aph-muted">{t.startedAgo(since(job.receiveTime ?? job.assignTime, now, t))}</div>
            {isLongRunning(job, now) && <span className="aph-badge aph-badge-warning">{t.longRunning}</span>}
          </>
        ) : (
          <span className="aph-muted">—</span>
        )}
      </td>
      <td>
        {last ? (
          <>
            <div>
              <JobName job={last} />
            </div>
            <div className="aph-muted">
              {t.finishedAgo(t.result[last.result ?? ""] ?? last.result ?? t.unknown, since(last.finishTime, now, t))}
            </div>
          </>
        ) : (
          <span className="aph-muted">—</span>
        )}
      </td>
    </tr>
    {showCaps && (
      <tr className="aph-caps-row">
        <td colSpan={5}>
          <CapabilityList caps={caps} />
        </td>
      </tr>
    )}
    </>
  );
}

/** Aynı pipeline'ın bekleyen işleri tek satırda; birden fazlaysa tek tek görmek için açılır. */
function QueueGroupRow({ group, agents, now }: { group: QueueGroup; agents: Agent[]; now: number }) {
  const t = useStrings();
  const [open, setOpen] = React.useState(false);
  const oldest = group.jobs[0];
  const many = group.jobs.length > 1;
  const waited = (r: JobRequest) => formatDuration(waitSeconds(r, now) ?? 0, t.units);
  return (
    <li className="aph-qgroup">
      <div className="aph-qrow">
        <span>
          <JobName job={oldest} />
          {many && (
            <button className="aph-count" aria-expanded={open} onClick={() => setOpen(!open)}>
              × {group.jobs.length} {open ? "▾" : "▸"}
            </button>
          )}
          <div className="aph-muted">{t.waitReason(explainWait(oldest, agents))}</div>
        </span>
        <span className="aph-muted aph-nowrap">{many ? t.oldestWaiting(waited(oldest)) : t.waiting(waited(oldest))}</span>
      </div>
      {open && (
        <ul className="aph-queue-scroll aph-qjobs">
          {group.jobs.map((r) => (
            <li key={r.requestId}>
              <span>
                <JobName job={r} label={t.request(r.requestId)} />
              </span>
              <span className="aph-muted aph-nowrap">{t.waiting(waited(r))}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Pipeline'a göre gruplanmış bekleyen işler; ilk `preview` grup gösterilir, tümü istenirse liste kayar. */
function QueueList(props: { title: string; items: JobRequest[]; agents: Agent[]; now: number; preview: number }) {
  const { items, agents, now, preview } = props;
  const t = useStrings();
  const [all, setAll] = React.useState(false);
  if (!items.length) return null;
  const groups = groupQueue(items, now);
  const shown = all ? groups : groups.slice(0, preview);
  return (
    <div className="aph-queue">
      <div className="aph-section-title">{props.title}</div>
      {shown.length > 0 && (
        <ul className={all ? "aph-queue-scroll" : undefined}>
          {shown.map((g) => (
            <QueueGroupRow key={g.jobs[0].requestId} group={g} agents={agents} now={now} />
          ))}
        </ul>
      )}
      {groups.length > preview && (
        <button className="aph-more" onClick={() => setAll(!all)}>
          {all ? t.showFewerQueued : t.showAllQueued(items.length)}
        </button>
      )}
    </div>
  );
}

const USAGE_TOP = 5;

/** Tamamlanan son işlerde havuzu en çok meşgul eden pipeline'lar. */
function UsageList({ requests }: { requests: JobRequest[] }) {
  const t = useStrings();
  const usage = usageByPipeline(requests);
  if (!usage.length) return null;
  const jobs = usage.reduce((n, u) => n + u.count, 0);
  const max = Math.max(...usage.map((u) => u.totalSec), 1);
  return (
    <div className="aph-queue">
      <div className="aph-section-title">{t.usageTitle(jobs)}</div>
      <ul>
        {usage.slice(0, USAGE_TOP).map((u) => (
          <li key={u.name ?? ""} className="aph-usage">
            <span className="aph-usage-name">{u.name ?? t.unknown}</span>
            <span className="aph-usage-bar">
              <span style={{ width: `${Math.max(2, Math.round((u.totalSec / max) * 100))}%` }} />
            </span>
            <span className="aph-muted aph-nowrap">{t.usageRow(u.count, formatDuration(u.totalSec, t.units))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Havuzdaki agent'ların yetenek farkları: satırlar yetenek, sütunlar agent. Kapalı gelir. */
function DriftTable({ agents }: { agents: Agent[] }) {
  const t = useStrings();
  const [open, setOpen] = React.useState(false);
  const [onlyMissing, setOnlyMissing] = React.useState(true);
  const drift = capabilityDrift(agents);
  if (!drift.rows.length) return null;
  const missing = drift.rows.filter((r) => r.kind === "missing");
  const rows = onlyMissing ? missing : drift.rows;
  return (
    <div className="aph-queue">
      <button className="aph-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t.driftTitle(missing.length, drift.rows.length - missing.length)} {open ? "▾" : "▸"}
      </button>
      {open && (
        <>
          <div>
            <button
              className={`aph-chip${onlyMissing ? " aph-chip-on" : ""}`}
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing(!onlyMissing)}
            >
              {t.driftOnlyMissing}
            </button>
          </div>
          {rows.length === 0 && <div className="aph-muted aph-drift-empty">{t.driftNone}</div>}
          {rows.length > 0 && (
            <div className="aph-drift">
              <table className="aph-table">
                <thead>
                  <tr>
                    <th>{t.colCapability}</th>
                    {drift.agents.map((a) => (
                      <th key={a.id}>{a.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      {row.values.map((value, i) => (
                        <td key={drift.agents[i].id} title={value ?? undefined}>
                          {value === null ? (
                            <span className="aph-badge aph-badge-offline">{t.driftMissing}</span>
                          ) : (
                            <span className="aph-drift-value">{value}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PoolCard(props: { data: PoolData; summary: PoolSummary; now: number; url?: string }) {
  const { data, summary, now } = props;
  const t = useStrings();
  const [open, setOpen] = React.useState(summary.health === "warning" || summary.health === "critical");
  const latest = latestVersion(data.agents);
  const queued = (data.requests ?? [])
    .filter((r) => requestState(r) === "queued")
    .sort((a, b) => (waitSeconds(b, now) ?? 0) - (waitSeconds(a, now) ?? 0));
  const stale = queued.filter((r) => isStaleRequest(r, now));
  const fresh = queued.filter((r) => !isStaleRequest(r, now));
  return (
    <Card className="aph-card" contentProps={{ contentPadding: false }}>
      <div className="aph-pool">
        <button className="aph-pool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Status {...HEALTH_STATUS[summary.health]} size={StatusSize.l} />
          <div className="aph-pool-title">
            <div className="aph-pool-name">
              {data.pool.name}
              {data.pool.poolType === "deployment" && (
                <span className="aph-badge aph-badge-disabled aph-pool-tag">{t.deploymentTag}</span>
              )}
            </div>
            <div className="aph-muted">{summary.reasons.length ? summary.reasons.map(t.reason).join(" · ") : t.noProblems}</div>
          </div>
          <div className="aph-stats">
            <Stat label={t.statOnline} value={`${summary.online}/${summary.total}`} />
            <Stat
              label={t.statOccupancy}
              value={occupancy(summary) === null ? "—" : t.percent(occupancy(summary)!)}
              meter={occupancy(summary)}
            />
            <Stat label={t.statRunning} value={summary.running} />
            <Stat label={t.statQueued} value={summary.queued ?? "?"} />
            <Stat
              label={t.statAvgWait}
              value={summary.avgWaitSec === null ? "—" : formatDuration(summary.avgWaitSec, t.units)}
            />
          </div>
          <span className="aph-chevron">{open ? "▾" : "▸"}</span>
        </button>

        {open && (
          <div className="aph-pool-body">
            {data.error && (
              <MessageCard severity={MessageCardSeverity.Warning}>
                {t.agentListError(data.error)}
              </MessageCard>
            )}
            {data.requests === null && (
              <div className="aph-muted aph-note">{t.queueUnreadable}</div>
            )}
            {summary.outdated > 0 && latest && (
              <div className="aph-muted aph-note">{t.outdatedNote(summary.outdated, latest)}</div>
            )}
            <QueueList title={t.queuedJobs} items={fresh} agents={data.agents} now={now} preview={QUEUE_PREVIEW} />
            {/* Bayat işler kapalı gelir; yalnızca istenirse listelenir. */}
            <QueueList title={t.staleJobs(formatDuration(STALE_SEC, t.units))} items={stale} agents={data.agents} now={now} preview={0} />
            <UsageList requests={data.requests ?? []} />
            {data.agents.length > 0 && (
              <table className="aph-table">
                <thead>
                  <tr>
                    <th>{t.colAgent}</th>
                    <th>{t.colStatus}</th>
                    <th>{t.colVersion}</th>
                    <th>{t.colRunningJob}</th>
                    <th>{t.colLastJob}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => (
                    <AgentRow key={a.id} agent={a} now={now} latest={latest} />
                  ))}
                </tbody>
              </table>
            )}
            {!data.error && data.agents.length === 0 && <div className="aph-muted aph-note">{t.emptyPool}</div>}
            <DriftTable agents={data.agents} />
            {props.url && (
              <a className="aph-link" href={props.url} target="_blank" rel="noopener noreferrer">
                {t.openPoolSettings}
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Uzun süredir iş almamış agent'ların listesi; kapalı gelir. */
function UnusedCard({ items }: { items: UnusedAgent[] }) {
  const t = useStrings();
  const [open, setOpen] = React.useState(false);
  if (!items.length) return null;
  return (
    <Card className="aph-card" contentProps={{ contentPadding: false }}>
      <div className="aph-pool">
        <button className="aph-pool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <div className="aph-pool-title">
            <div className="aph-pool-name">{t.unusedTitle(items.length)}</div>
            <div className="aph-muted">{t.unusedHint(formatDuration(UNUSED_SEC, t.units))}</div>
          </div>
          <span className="aph-chevron">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <div className="aph-pool-body">
            <table className="aph-table">
              <thead>
                <tr>
                  <th>{t.colAgent}</th>
                  <th>{t.colPool}</th>
                  <th>{t.colStatus}</th>
                  <th>{t.colLastJob}</th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ agent, pool, idleSec, neverRan }) => {
                  const state = agentState(agent);
                  const last = agent.lastCompletedRequest;
                  const idle = formatDuration(idleSec, t.units);
                  return (
                    <tr key={`${pool.id}-${agent.id}`}>
                      <td>{agent.name}</td>
                      <td>{pool.name}</td>
                      <td>
                        <span className={`aph-badge aph-badge-${state}`}>{t.agentState[state]}</span>
                      </td>
                      <td>
                        {neverRan || !last
                          ? t.neverRan(idle)
                          : t.lastJobAgo(last.definition?.name ?? t.request(last.requestId), idle)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Sunucudan ne okunabildiğinin özeti; sorun bildirirken ekran görüntüsü almak için. */
function Diagnostics({ info }: { info: Record<string, unknown> }) {
  const t = useStrings();
  const [open, setOpen] = React.useState(false);
  return (
    <div className="aph-diag">
      <button className="aph-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t.diagnostics} {open ? "▾" : "▸"}
      </button>
      {open && (
        <>
          <div className="aph-muted">{t.diagnosticsHint}</div>
          <pre>{JSON.stringify(info, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: React.ReactNode; meter?: number | null }) {
  return (
    <div className="aph-stat">
      <div className="aph-stat-value">{props.value}</div>
      <div className="aph-muted">{props.label}</div>
      {props.meter !== undefined && props.meter !== null && (
        <div className={`aph-meter${props.meter >= 100 ? " aph-meter-full" : ""}`}>
          <span style={{ width: `${Math.min(100, props.meter)}%` }} />
        </div>
      )}
    </div>
  );
}

function App(props: { source: DataSource; demo: boolean; extra?: Record<string, unknown> }) {
  const { source, demo, extra } = props;
  const t = useStrings();
  const [pools, setPools] = React.useState<PoolData[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [auto, setAuto] = React.useState(true);
  const [updated, setUpdated] = React.useState<number>(Date.now());
  const [query, setQuery] = React.useState("");
  const [onlyProblems, setOnlyProblems] = React.useState(false);
  const [hideInactive, setHideInactive] = React.useState(false);
  const [scope, setScope] = React.useState<PoolScope>("all");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setPools(await source.load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdated(Date.now());
      setLoading(false);
    }
  }, [source]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [auto, refresh]);

  const now = updated;
  // Kapsam seçimi (tümü / agent / deployment) özet kutularını ve alttaki listeleri birlikte daraltır;
  // arama ve diğer filtreler yalnızca havuz listesini etkiler.
  const hasDeployment = (pools ?? []).some((p) => p.pool.poolType === "deployment");
  const scoped = (pools ?? []).filter((p) => inScope(p, hasDeployment ? scope : "all"));
  const rows = sortByHealth(scoped.map((data) => ({ data, summary: summarizePool(data, now) })));
  const totals = summarizeAll(rows.map((r) => r.summary));
  const visible = filterRows(rows, { query, onlyProblems, hideInactive });
  const unused = findUnusedAgents(scoped, now);
  const queueNotes = [
    totals.stale ? t.staleNote(totals.stale, formatDuration(STALE_SEC, t.units)) : "",
    totals.queueUnknownPools ? t.queueUnknownPools(totals.queueUnknownPools) : "",
  ].filter(Boolean);

  const exportCsv = () => {
    // BOM, Excel'in UTF-8'i (Türkçe karakterleri) doğru açması için.
    const blob = new Blob(["\ufeff" + toCsv(inventoryRows(scoped, now, t), t.csvSeparator)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.csvFileName}-${new Date(now).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const commands: IHeaderCommandBarItem[] = [
    { id: "csv", text: t.exportCsv, disabled: !scoped.length, onActivate: exportCsv },
    {
      id: "auto",
      text: auto ? t.autoRefreshOn : t.autoRefreshOff,
      onActivate: () => setAuto(!auto),
    },
    { id: "refresh", text: loading ? t.refreshing : t.refresh, isPrimary: true, disabled: loading, onActivate: () => { refresh(); } },
  ];

  return (
    <Page className="aph-page">
      <Header
        title={t.title}
        titleSize={TitleSize.Large}
        description={t.lastUpdated(new Date(updated).toLocaleTimeString(t.locale)) + (demo ? ` · ${t.demoData}` : "")}
        commandBarItems={commands}
      />
      <div className="aph-content">
        {error && (
          <MessageCard severity={MessageCardSeverity.Error}>
            {t.loadError(error)}
          </MessageCard>
        )}
        {pools === null && !error && <div className="aph-muted">{t.loading}</div>}
        {pools !== null && (
          <>
            {hasDeployment && (
              <div className="aph-scope" role="group" aria-label={t.scopeLabel}>
                {(["all", "automation", "deployment"] as PoolScope[]).map((value) => (
                  <button
                    key={value}
                    className={`aph-scope-item${scope === value ? " aph-scope-on" : ""}`}
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                  >
                    {t.scope[value]}
                  </button>
                ))}
              </div>
            )}
            <div className="aph-tiles">
              <Tile
                label={t.tileProblemPools}
                value={`${totals.problemPools}/${totals.pools}`}
                tone={
                  rows.some((r) => r.summary.health === "critical") ? "critical" : totals.problemPools ? "warning" : "ok"
                }
                note={totals.inactivePools ? t.inactivePoolsNote(totals.inactivePools) : undefined}
              />
              <Tile label={t.tileOfflineAgents} value={`${totals.offline}/${totals.agents}`} tone={totals.offline ? "warning" : "ok"} />
              <Tile label={t.tileRunning} value={totals.running} />
              <Tile
                label={t.tileQueued}
                value={totals.queued}
                tone={totals.queued > totals.stale ? "warning" : "ok"}
                note={queueNotes.length ? queueNotes.join(" · ") : undefined}
              />
            </div>
            {rows.length === 0 && <div className="aph-muted">{t.noPools}</div>}
            {rows.length > 0 && (
              <div className="aph-filters">
                <input
                  className="aph-search"
                  type="search"
                  value={query}
                  placeholder={t.searchPlaceholder}
                  aria-label={t.searchPlaceholder}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className={`aph-chip${onlyProblems ? " aph-chip-on" : ""}`}
                  aria-pressed={onlyProblems}
                  onClick={() => setOnlyProblems(!onlyProblems)}
                >
                  {t.filterProblems}
                </button>
                <button
                  className={`aph-chip${hideInactive ? " aph-chip-on" : ""}`}
                  aria-pressed={hideInactive}
                  onClick={() => setHideInactive(!hideInactive)}
                >
                  {t.filterHideInactive}
                </button>
              </div>
            )}
            {rows.length > 0 && visible.length === 0 && <div className="aph-muted">{t.noMatches}</div>}
            {visible.map((r) => (
              <PoolCard key={r.data.pool.id} {...r} now={now} url={source.poolUrl?.(r.data.pool)} />
            ))}
            <UnusedCard items={unused} />
            {source.diagnostics && (
              <Diagnostics
                info={{
                  ...source.diagnostics(),
                  language: t.locale,
                  ...extra,
                }}
              />
            )}
          </>
        )}
      </div>
    </Page>
  );
}

function render(
  source: DataSource,
  demo: boolean,
  culture: string | null | undefined,
  extra?: Record<string, unknown>,
) {
  const strings = STRINGS[pickLang(culture)];
  document.documentElement.lang = strings.locale.slice(0, 2);
  ReactDOM.render(
    <I18n.Provider value={strings}>
      <App source={source} demo={demo} extra={extra} />
    </I18n.Provider>,
    document.getElementById("root"),
  );
}

async function start() {
  // Azure DevOps dışında (npm run dev) açıldıysa örnek veriyle çalış; dil ?lang=tr|en ile seçilebilir.
  if (window.self === window.top) {
    render(mockSource, true, new URLSearchParams(window.location.search).get("lang") ?? navigator.language);
    return;
  }
  await SDK.init({ loaded: false, applyTheme: true });
  await SDK.ready();
  try {
    const location = await SDK.getService<ILocationService>(CommonServiceIds.LocationService);
    const baseUrl = await location.getServiceLocation();
    // Kullanıcının Azure DevOps profilindeki dil, örn. "tr-TR". Azure DevOps Server 2022 sayfa
    // bilgisini göndermez ve getPageContext() hata fırlatır; o durumda sırayla Azure DevOps
    // sayfasının diline, sonra tarayıcı diline düşülür.
    const culture = firstCulture([
      () => SDK.getPageContext().globalization.culture,
      () => window.parent.document.documentElement.lang,
      () => navigator.language,
    ]);
    const source = createRestSource(baseUrl, () => SDK.getAccessToken());
    const context = SDK.getExtensionContext();
    render(source, false, culture, { extensionVersion: context?.version, culture: culture ?? null });
    await SDK.notifyLoadSucceeded();
  } catch (e) {
    await SDK.notifyLoadFailed(e instanceof Error ? e : String(e));
  }
}

start();
