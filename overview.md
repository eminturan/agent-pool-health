# Agent Pool Health Dashboard

See the status of all your self-hosted agent pools and deployment pools on one page. The extension adds an
**Agent Health** page to the Pipelines menu.

## What it shows

- **Summary:** number of pools with problems, offline agents, running jobs and queued jobs
- **Pool cards:** online agents, running and queued jobs, and average queue wait time.
  Pools with problems are listed first
- **Agent details:** status, how long an agent has been offline, version, operating system,
  the job currently running and the last completed job
- **Warnings:** offline agents, a job waiting longer than 5 minutes, no agent able to run jobs,
  and mixed agent versions in the same pool
- **Why a job is waiting:** each queued job is compared with the agents in its pool: no agent
  meets its demands (and which demand is unmet), matching agents are busy, or they are offline
- **Long-running jobs:** a job running for more than 1 hour is flagged
- **Queue grouped by pipeline:** queued jobs of the same pipeline are shown as one row with a
  count; expand it to see each job
- **Usage:** which pipelines kept the pool busiest in the last completed jobs
- **Deployment pools:** deployment group pools are shown with the same rules; switch between all pools,
  agent pools only and deployment pools only
- **Links:** job names open the pipeline run
- **Search and filters:** search by pool or agent name, show only pools with problems, hide
  disabled pools
- **Occupancy:** the share of online agents in a pool that are busy
- **Agent capabilities:** expand an agent to see and search its capabilities
- **CSV export:** download the agent inventory of the pools shown
- **Capability differences:** compare the agents in a pool and see which capability is missing
  on which agent
- **My jobs only:** show only the jobs you started; queued jobs show who requested them
- **Outdated agents:** agents behind the newest agent version in their pool are marked
- **Disabled pools:** a pool whose agents are all disabled is shown as disabled, not as a problem
- **Stale jobs:** jobs queued for more than a day are included in the queue count but flagged
  and listed separately, and they do not raise a warning
- **Unused agents:** agents that have not run a job in the last 90 days, across all pools

The page refreshes every 30 seconds; auto-refresh can be turned off.

## Languages

The page is available in English and Turkish. It follows the language set in your Azure DevOps
profile: Turkish for Turkish profiles, English for every other language. On Azure DevOps Server
2022 the profile language is not available to extensions, so the page falls back to the language
of the Azure DevOps page and then to your browser language.

## Requirements

- Azure DevOps Server 2022 or Azure DevOps Services
- Permission to view the agent pools (Reader role on the pool)

## Permissions

The extension only reads data; it changes nothing and sends no data outside Azure DevOps.

- `vso.agentpools`: read agent pools, agents and their job queues
- `vso.build`: read builds, used only to find out who requested a job ("My jobs only")

## Known limitations

- Machine metrics such as disk, CPU and memory are not shown; Azure DevOps does not store them.
- There is no historical trend; the page shows the current state.

## Release notes

- **0.7.0:** capability differences, my jobs only, outdated agents
- **0.6.0:** occupancy, agent capabilities, CSV export
- **0.5.0:** switch between all pools, agent pools and deployment pools
- **0.4.0:** queue grouped by pipeline, usage breakdown, deployment pools
- **0.3.0:** why a job is waiting, links to pipeline runs, long-running jobs, search and filters
- **0.2.0:** disabled pools, stale jobs, unused agents, offline duration
- **0.1.0:** first version

The full list is in `CHANGELOG.md` in the source repository.

## Source and license

Source code: https://github.com/eminturan/agent-pool-health

Released under the MIT License. Developed by Emin Turan.
