# Agent Pool Health Dashboard

**English** | [Türkçe](README.tr.md)

An Azure DevOps extension that adds an **Agent Health** page to the Pipelines menu and shows the
status of all self-hosted agent pools and deployment pools on one page. It only reads data.

Works on Azure DevOps Server 2022 and Azure DevOps Services.

## Features

**Overview**

- Summary tiles: pools with problems, offline agents, running jobs, queued jobs
- One card per pool: online agents, occupancy, running and queued jobs, average queue wait
- Pools with problems are listed first; the page refreshes every 30 seconds (can be turned off)
- Switch between all pools, agent pools only and deployment pools only; the summary follows

**Health rules**

- Warning: an offline agent, a job queued for more than 5 minutes, a job running for more than
  1 hour, or an unreadable agent list
- Critical: the pool has agents but none can run jobs
- Disabled: every agent in the pool is disabled and nothing recent is queued. Shown in grey,
  listed last, not counted as a problem
- Jobs queued for more than a day are "stale": they are counted in the queue and listed
  separately, but they do not raise a warning

**Queue**

- Queued jobs are grouped by pipeline ("Nightly-Tests × 30"); expand a group to see each job
- Each queued job says why it is waiting: no agent meets its demands (and which demand is
  unmet), matching agents are busy, or matching agents are offline or disabled
- Job names link to the pipeline run

**Agents**

- Status, how long an agent has been offline, version, operating system, running job, last job
- Agents behind the newest agent version in their pool are marked as outdated
- Capabilities: expand an agent to see and search its capabilities
- Capability differences: compare the agents in a pool and see which capability is missing on
  which agent. Machine-specific values such as the computer name or PATH are skipped
- Unused agents: agents that have not run a job in the last 90 days, across all pools

**Other**

- Usage: the five pipelines that kept a pool busiest in its last completed jobs
- Search by pool or agent name; filters for pools with problems and disabled pools
- Export the agent inventory as CSV
- English and Turkish UI

## Install

Build the package (see below) or download it from the Marketplace, then on your server:
Collection Settings → Extensions → Browse local extensions → Manage extensions → Upload
extension, and install it into the collection. The page appears under **Pipelines → Agent Health**
in every project.

## Permissions

| Scope | Used for |
| --- | --- |
| `vso.agentpools` | Read agent pools, agents and their job queues |

The page shows the pools the signed-in user is allowed to see. A user without the Reader role on
a pool sees a per-pool warning instead of its agents.

## Security

- **Read-only.** The extension makes only GET requests with the `vso.agentpools` scope. It cannot
  change agents, pools or jobs.
- **The user's own permissions apply.** Every request is made as the signed-in user; the server
  decides what that user may see. The access token is sent only to the collection URL and is not
  stored or logged.
- **What a pool reader can see.** The queue lists the pipelines of every project that uses a
  pool, so a user may see the name of a pipeline in a project they cannot open. This is decided by
  the Reader role on the pool (Collection Settings → Agent pools → Security), as in Azure DevOps'
  own pool pages.
- **Secrets in capabilities are masked.** Agents report the environment variables of their
  machine as capabilities. Values of capabilities whose name looks like a secret (token,
  password, secret, key, credential, connection string, auth, cert, PAT) and credentials embedded
  in URLs are replaced with `••••••` everywhere on the page. Name-based masking cannot catch a
  secret stored under an innocent name; keep secrets out of agent environment variables.
- **CSV export is safe to open in Excel.** Cells that start with `=`, `+`, `-` or `@` are
  prefixed with a single quote so that a pipeline or agent name cannot run as a formula.
- **Links.** Only `http` and `https` addresses are rendered as links.
- **Server load.** The page stops refreshing while its browser tab is in the background.

## Development

```bash
npm install
```

```bash
npm run dev
```

The page opens at `http://localhost:3000/hub/hub.html` with sample data from `src/hub/mock.ts`.
Outside Azure DevOps the SDK is not used; real data only appears once the extension is installed.
Add `?lang=en` or `?lang=tr` to pick the language.

```bash
npm test
```

### Structure

| File | Contents |
| --- | --- |
| `vss-extension.json` | Manifest: hub contribution, scopes |
| `src/hub/hub.tsx` | UI and SDK start-up |
| `src/hub/api.ts` | REST calls (`api-version=7.0`) |
| `src/hub/metrics.ts` | Health rules and calculations (pure functions, tested) |
| `src/hub/i18n.ts` | English and Turkish strings, language selection |
| `src/hub/export.ts` | CSV export |
| `src/hub/mock.ts` | Sample data for development |

Thresholds are constants in `metrics.ts`: `QUEUE_WARN_SEC` (queue warning, 5 min), `STUCK_SEC`
(long-running job, 1 h), `STALE_SEC` (stale job, 1 day), `UNUSED_SEC` (unused agent, 90 days).
The refresh interval `REFRESH_MS` and the number of queue entries shown `QUEUE_PREVIEW` are in
`hub.tsx`.

### Language

The language follows the user's Azure DevOps profile
(`SDK.getPageContext().globalization.culture`): Turkish if it starts with `tr`, English otherwise.
Azure DevOps Server 2022 does not pass this to extensions (`getPageContext()` throws), so the page
falls back to the language of the Azure DevOps page and then to the browser language.

All strings are in `src/hub/i18n.ts`. Add every new string to both dictionaries; a test checks
that the keys match.

The name in the Pipelines menu (`Agent Health`) comes from the manifest and is the same in every
language.

## Packaging and publishing

```bash
npm run package
```

This creates a `.vsix` file under `out/`. Increase `version` in `vss-extension.json` before
uploading a new build; the server rejects a version it has already seen.

The extension is set up to be published under the `turanemin` publisher; the Marketplace page is
`overview.md`. Either upload the `.vsix` at https://marketplace.visualstudio.com/manage, or
publish from the command line (asks for a PAT with the Marketplace → Manage scope):

```bash
npm run publish:marketplace
```

`"public": true` in the manifest publishes the extension for everyone; set it to `false` for a
private listing. For a new release, update both `CHANGELOG.md` and the "Release notes" section of
`overview.md`.

## Tested on

Azure DevOps Server 2022.0.1: the page loads, agent pools and agents are listed, and the job queue
is read.

The following depend on fields the server may or may not return, and have only been checked
against sample data. Each degrades gracefully when its data is missing:

| Feature | Depends on | If missing |
| --- | --- | --- |
| Queued jobs | `pools/{id}/jobrequests` (`7.0-preview.1`, undocumented) | "Could not read the job queue" note on that pool |
| Offline duration | `statusChangedOn` on the agent | Duration is not shown |
| Never-used agents | `createdOn` on the agent | Agent is left out of the unused list |
| Why a job is waiting | `demands` / `matchedAgents` on the job, capabilities on the agent | Reason is based on agent status only |
| Links to runs | `owner._links.web.href` on the job | Job name is plain text |
| Deployment pools | `pools?poolType=deployment` | Only agent pools are shown |
| CSV export | The browser allowing downloads from the extension frame | Nothing is downloaded |

On Azure DevOps Server 2022.0.1 every field in this table was returned, as shown by the
Diagnostics section at the bottom of the page. Open it when something looks wrong: it lists what
could be read from the server (counts, field names and server error messages only).

## Out of scope

- Machine metrics such as disk, CPU and memory (Azure DevOps does not store them)
- Historical trends (needs data storage)
- Notifications (the extension only runs while the page is open)
- A per-developer view such as "my jobs": this page is about agent health; finding who started a
  job needs the build-read permission and belongs in a separate extension

## License

[MIT](LICENSE) © Emin Turan. Release notes are in [CHANGELOG.md](CHANGELOG.md).
