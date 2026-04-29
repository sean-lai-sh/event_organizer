# Work Attribution from Closed Pull Requests

This document summarizes contribution evidence from the repository's **closed pull requests only**. It is intended to support project-report attribution without treating open work, informal discussion, or unmerged branches as main-branch implementation evidence.

## Attribution Method

Attribution is based first on the assignee of a closed pull request. The current closed PR set has no PR-level assignees, so the fallback attribution is the PR author. When a closed PR explicitly references a GitHub issue, the issue assignee is recorded as supporting context, but issue assignment is not treated as proof that the assigned person authored the merged implementation.

Closed but unmerged PRs are listed separately because they are evidence of attempted or reviewed work, but they are **not** evidence of code that reached `main`.

## Contributor Rollup

| Contributor | Merged Closed PRs | Closed but Unmerged PRs | Main Evidence |
|---|---:|---:|---|
| Sean Lai | 24 | 1 | Core event flows, agent-first architecture, Modal runtime, MCP and Attio/Convex integration, normalized agent persistence, streaming, approvals, artifacts, OnceHub room booking, and architecture documentation. |
| Yvette Bu | 2 | 2 | Dashboard/data UI work and sidebar/UI updates through merged PRs #26 and #56; additional closed-unmerged search/sidebar attempts in #27 and #28. |
| Eason Wang | 1 | 1 | Agent workspace empty-state and thread-management UI in merged PR #25; earlier closed-unmerged event-calendar work in #5. |
| Sean Hu | 0 | 1 | Closed-unmerged PR #3 plus linked issue assignment context for #42; no closed merged PR currently attributes main-branch implementation directly to Sean Hu. |

## Merged Closed PRs in Main-Branch Evidence

| PR | Contributor Fallback | Scope |
|---:|---|---|
| #1 | Sean Lai | Event creation UI and auth redirect/session updates. |
| #2 | Sean Lai | Event panel changes, UI presets, and invite-link feature set. |
| #4 | Sean Lai | Event creation and early event-management implementation, including supporting tooling areas. |
| #12 | Sean Lai | Attio API-key configuration cleanup and Attio client tests. |
| #13 | Sean Lai | Primary `/agent` workspace with three-panel layout. |
| #14 | Sean Lai | Normalized Convex agent state persistence. |
| #15 | Sean Lai | Modal conversational runtime and MCP IO tests. |
| #16 | Sean Lai | Refactor of agent launchers into `apps/` and `core/` layout. |
| #17 | Sean Lai | Attendance data insights dashboard restoration. |
| #25 | Eason Wang | Agent empty state and thread-management UI improvements. |
| #26 | Yvette Bu | Dashboard data UI. |
| #29 | Sean Lai | Normalized reasoning-trace pipeline; references issue #20. |
| #31 | Sean Lai | Thread rename/delete API fixes. |
| #40 | Sean Lai | Live token streaming and reactive thread state; references issue #33 assigned to Sean Lai. |
| #41 | Sean Lai | Truthful run summaries, artifacts, and previews; references issue #34 assigned to Sean Lai. |
| #43 | Sean Lai | Agent UI polish: routing, inline traces, skeleton loading, and thread caching. |
| #44 | Sean Lai | Workflow update and visibility changes. |
| #45 | Sean Lai | Event creation flow with approval UI and improved payload display. |
| #49 | Sean Lai | Thread-aware runtime harness and persistent field review; references issue #48. |
| #51 | Sean Lai | Separation of Attio people identity from speakers workflow state. |
| #53 | Sean Lai | OnceHub live room slots, approval-gated booking, and `event_room_bookings`; references issue #52. |
| #56 | Yvette Bu | Sidebar UI and related dashboard/frontend updates. |
| #57 | Sean Lai | Stable incremental markdown during streaming; references issue #35 assigned to Sean Lai. |
| #58 | Sean Lai | Readable resolved-approval receipts; closes issue #46. |
| #59 | Sean Lai | Composer-attached approval prompt; references issue #42 assigned to Sean Hu. |
| #61 | Sean Lai | OnceHub client rewrite to internal browser API, with no API key required; references issue #52. |
| #65 | Sean Lai | Simplified approval history rendering and pinned pending approval behavior; references issue #60. |

## Closed but Unmerged PRs

| PR | Contributor Fallback | Scope | Attribution Note |
|---:|---|---|---|
| #3 | Sean Hu | Invite-management dashboard and invite-generation UI overhaul. | Closed without merge, so it should not be cited as main-branch implementation. |
| #5 | Eason Wang | Event calendar work. | Closed without merge, so it should not be cited as main-branch implementation. |
| #27 | Yvette Bu | Sidebar UI attempt. | Closed without merge; later merged sidebar/UI evidence appears in #56. |
| #28 | Yvette Bu | Search page UI attempt. | Closed without merge, so it should not be cited as main-branch implementation. |
| #54 | Sean Lai | OnceHub room finding and booking attempt. | Closed without merge; merged implementation evidence appears in #53 and #61. |

## Linked Issue Context

| Issue | Assignment | Related Closed PR Evidence |
|---:|---|---|
| #20 | Unassigned | Referenced by merged PR #29 for reasoning traces. |
| #33 | Sean Lai | Referenced by merged PR #40 for live streaming and reactive thread state. |
| #34 | Sean Lai | Referenced by merged PR #41 for truthful summaries and artifacts. |
| #35 | Sean Lai | Referenced by merged PR #57 for incremental markdown streaming. |
| #42 | Sean Hu | Referenced by merged PR #59 for composer-attached approval prompts; implementation PR author is Sean Lai, while issue assignment records Sean Hu as issue owner/context. |
| #46 | Unassigned | Closed by merged PR #58 for readable approval history. |
| #48 | Unassigned | Referenced by merged PR #49 for thread-aware runtime and approval-safe continuation. |
| #52 | Unassigned | Referenced by merged PRs #53 and #61 for OnceHub integration. |
| #60 | Unassigned | Referenced by merged PR #65 for approval-box UI changes. |

## Practical Attribution Language for Reports

Sean Lai should be credited for the majority of merged main-branch implementation in the current closed-PR record, especially the agent runtime, architecture, MCP tool surface, Convex agent state, streaming, approvals, Attio workflow separation, and OnceHub booking integration. Eason Wang should be credited for the merged agent empty-state and thread-management UI work in PR #25. Yvette Bu should be credited for merged dashboard/data UI and sidebar/UI work in PRs #26 and #56. Sean Hu should be credited for closed issue/PR coordination context, especially issue #42 assignment and closed PR #3, but the current closed-PR evidence does not show a merged main-branch implementation PR authored by or assigned to Sean Hu.
