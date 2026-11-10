# Changelog

## 0.8.2

- Removed the source repository links from the Marketplace page and the manifest

## 0.8.1

Security hardening:

- Capability values whose name looks like a secret, and credentials embedded in URLs, are masked
- CSV export: cells starting with `=`, `+`, `-` or `@` can no longer run as formulas in Excel
- Only `http` and `https` addresses are rendered as links
- The page stops refreshing while its browser tab is in the background

## 0.8.0

- Capability differences: compare the capabilities of the agents in a pool and see what is missing where
- Agents on an older version than the newest in their pool are marked as outdated
- Diagnostics section at the bottom of the page: what could be read from the server (counts, field names and server error messages)
- The extension requests only the `vso.agentpools` permission

Versions 0.7.0 to 0.7.4 were test builds that also asked for the build-read permission for a
"My jobs only" filter. That filter was removed: this page is about agent health.

## 0.6.0

- Occupancy per pool: the share of online agents that are busy, with a meter
- Agent capabilities: expand an agent to see and search its capabilities
- Export the agent inventory as CSV
- MIT license and source repository link

## 0.5.0

- Switch between all pools, agent pools only and deployment pools only; the summary follows the selection

## 0.4.1

- Fixed: deployment pools were not listed

## 0.4.0

- Queued jobs are grouped by pipeline; expand a group to see each job
- Usage: the pipelines that kept a pool busiest in the last completed jobs
- Deployment pools are listed alongside agent pools
- A job is flagged as running long after 1 hour (was 2 hours)

## 0.3.0

- Why a job is waiting: no matching agent (and the unmet demand), matching agents busy, or matching agents offline
- Job names link to the pipeline run
- Jobs running for a long time are flagged
- Search by pool or agent name; filters for pools with problems and disabled pools

## 0.2.1

- The queued job count includes stale jobs again; the number of stale jobs is shown next to it

## 0.2.0

- A pool whose agents are all disabled is shown as disabled instead of critical
- Jobs queued for more than a day are flagged as stale and listed separately
- Unused agents: agents with no job in the last 90 days
- How long an agent has been offline
- Shorter operating system names

## 0.1.3

- Long queues show the first 10 entries; the full list scrolls inside the card

## 0.1.2

- Fixed: the page width changed when a pool card was expanded

## 0.1.1

- Fixed: the page failed to load on Azure DevOps Server 2022 ("getPageContext() before init()")

## 0.1.0

- First version: pool summary, pool cards, agent details, auto-refresh, English and Turkish
