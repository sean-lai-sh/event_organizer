# Agent Implementation

This document is the low-level implementation reference for the repo's "ML" layer. In this codebase, that layer is not a traditional training stack with feature stores, model registries, or offline batch training. It is an LLM-driven decision and generation layer embedded inside the Modal-hosted agent runtime and the outreach workflows. The purpose of this document is to explain exactly where model calls happen, what data they consume, what structured outputs they are expected to produce, how they are gated, and where failures can corrupt workflow state if the surrounding code is changed carelessly.

## Scope

This document covers:

- `agent/runtime/anthropic_adapter.py`
- `agent/runtime/service.py`
- `agent/runtime/policy.py`
- `agent/runtime/tool_executor.py`
- `agent/apps/mcp/service.py`
- `agent/helper/email_parse.py`
- `agent/helper/prompts/known_thread.txt`
- `agent/helper/prompts/net_new.txt`
- `agent/match.py`
- `agent/outreach.py`
- `agent/reply_handler.py`

It does not cover classical model training infrastructure because none exists in this repo today.

## What Counts As "ML" Here

There are four model-assisted pipelines in the current system:

1. Conversational agent turns in the Modal runtime.
2. Known-thread inbound email classification.
3. Net-new inbound email classification and event extraction.
4. Contact-event matching and outbound email composition.

All four use Anthropic models as inference-only services. No pipeline in this repository trains or fine-tunes a model locally.

## Runtime And Execution Context

### Conversational runtime

The main interactive agent runs through `agent/runtime/service.py` and `agent/runtime/anthropic_adapter.py`.

- `AgentRuntimeService.start_run()` creates a normalized run record.
- The service appends the user message to the in-memory store.
- The service calls the Anthropic adapter to execute the current turn.
- The adapter may call in-process tools through `agent/runtime/tool_executor.py`.
- Tool actions are classified by `agent/runtime/policy.py`.
- Read tools execute immediately.
- Write or send actions are converted into approval records before execution.
- Normalized threads, runs, messages, artifacts, approvals, and context links are synced to Convex by `agent/runtime/convex_sync.py`.

This path is operationally important because it is the only place where the general-purpose assistant is allowed to decide whether live business data should be read and whether a requested write should be paused for approval.

### Inbound email classification

Inbound email processing is split between `agent/reply_handler.py` and `agent/helper/email_parse.py`.

- `reply_handler.handle_reply()` is the webhook entrypoint.
- It claims a dedupe receipt in Convex before heavy processing.
- It routes the email to `handle_known_thread()` if the AgentMail thread is already linked to a Convex outreach row.
- It routes to `handle_net_new()` if the thread is not known.

The classification logic itself lives in `email_parse.py`, not in the webhook transport layer.

### Match and outreach workflows

These are Modal jobs, not part of the conversational `/agent` API.

- `agent/match.py` scores candidate contacts against an event.
- `agent/outreach.py` generates personalized outbound email copy.

They still belong in the repo's low-level ML layer because they are prompt-driven inference pipelines with structured side effects.

## Model Provider And Defaults

The implementation currently assumes Anthropic for all model-backed behavior.

- `agent/runtime/anthropic_adapter.py` uses `ANTHROPIC_API_KEY`.
- The default conversational model is `claude-haiku-4-5-20251001`.
- `agent/helper/email_parse.py` also defaults to `claude-haiku-4-5-20251001` for known-thread and net-new classification unless `ANTHROPIC_MODEL` overrides it.

Operational implication:

- if `ANTHROPIC_API_KEY` is missing in the conversational runtime, the adapter returns a local fallback text response instead of making a model call
- if `ANTHROPIC_API_KEY` is missing or the request fails in `email_parse.py`, classification falls back to conservative defaults rather than crashing the workflow immediately

## Prompt Surfaces

There are two prompt styles in the repo.

### File-backed prompts

Used by inbound processing:

- `agent/helper/prompts/known_thread.txt`
- `agent/helper/prompts/net_new.txt`

These are loaded at import time in `agent/helper/email_parse.py`.

### Inline prompts

Used by workflow jobs:

- `MATCH_SYSTEM_PROMPT` in `agent/match.py`
- `COMPOSE_SYSTEM_PROMPT` in `agent/outreach.py`
- `DEFAULT_SYSTEM_PROMPT` in `agent/runtime/anthropic_adapter.py`

Operational implication:

- import-time prompt loading means missing prompt files break startup, not just inference
- prompt edits change behavior immediately without any schema migration or model retraining step

## Pipeline Details

### 1. Conversational agent turn pipeline

Primary files:

- `agent/runtime/service.py`
- `agent/runtime/anthropic_adapter.py`
- `agent/runtime/policy.py`
- `agent/runtime/tool_executor.py`
- `agent/apps/mcp/service.py`

Flow:

1. A run starts in `AgentRuntimeService.start_run()`.
2. The runtime creates a `RunRecord` and appends a `run.started` stream event.
3. The user input is stored as a normalized message block.
4. `_execute_run()` calls the Anthropic adapter.
5. The adapter sends the user prompt plus `DEFAULT_SYSTEM_PROMPT` and the in-process tool definitions.
6. If Anthropic returns text only, the turn completes normally.
7. If Anthropic returns tool calls, each tool name is mapped to a `ToolAction`.
8. `ApprovalPolicy.evaluate()` determines whether the tool can run immediately.
9. Read tools execute through `execute_tool_call()`, which dispatches into `agent/apps/mcp/service.py`.
10. Write tools create approval records instead of executing immediately.
11. Approved writes resume later through `submit_approval()`.

Important implementation details:

- the adapter is a boundary, not the business-logic layer
- tool schemas are hardcoded in `_IN_PROCESS_TOOLS`
- tool dispatch is explicit in `TOOL_HANDLERS`
- the system relies on normalized internal records rather than raw Anthropic event payloads

Pitfalls:

- adding a new tool requires updating both the Anthropic tool schema and `TOOL_HANDLERS`
- moving guardrail logic out of `policy.py` would violate the repo contract
- returning raw SDK payloads to the frontend would couple product behavior to vendor event shapes

### 2. Known-thread inbound classification

Primary files:

- `agent/reply_handler.py`
- `agent/helper/email_parse.py`

Flow:

1. Webhook payload is parsed by `handle_reply()`.
2. Sender, subject, body, `to`, and `cc` are normalized.
3. `begin_inbound_receipt()` claims a Convex dedupe lease.
4. The system resolves the outreach row by AgentMail thread id.
5. `classify_known_thread()` builds a prompt containing:
   - event summary
   - historical thread messages
   - latest inbound message
6. Anthropic returns JSON.
7. `_clean_json()` strips markdown fences if present.
8. `_normalize_decision()` constrains output to:
   - `classification`
   - `reasoning`
   - `speaker_confirmed`
   - `room_confirmed`
   - `event_signal`
   - `timing_signal`
   - `event_extract`
9. `to_workflow_state()` maps the classification to Convex response/inbound-state values.
10. Convex inbound metadata is updated.
11. Event milestone booleans may be patched.
12. Attio notes and ownership updates are applied through helper paths.
13. The receipt is marked complete only after the write path succeeds.

Classification label set:

- `ACCEPTED`
- `DECLINED`
- `QUESTION`
- `NEEDS_HUMAN`

Fallback behavior:

- malformed JSON or model failure downgrades to `NEEDS_HUMAN`

Pitfalls:

- `_clean_json()` assumes the model returns a single JSON payload, optionally inside one fenced block
- broad exception handling protects uptime but can hide degraded model behavior if logging is weak
- `to_workflow_state()` maps into Convex response fields, not Attio `speakers.status`; future changes must preserve that system boundary

### 3. Net-new inbound classification and event extraction

Primary files:

- `agent/reply_handler.py`
- `agent/helper/email_parse.py`

Flow:

1. If no known outreach thread is found, `handle_net_new()` is used.
2. `classify_net_new()` builds a prompt from sender, recipients, subject, and body.
3. The model returns the same normalized decision envelope plus optional `event_extract`.
4. `upsert_inbound_contact()` ensures the sender exists in Attio.
5. If the extraction indicates a real event opportunity, `build_event_payload()` converts the model output into a Convex event payload.
6. The system may create a new Convex event and link it through `event_outreach`.
7. Dedupe is committed only after downstream writes succeed.

`build_event_payload()` constraints:

- date must match `YYYY-MM-DD` or it is dropped
- title is capped to 140 characters
- missing fields become `None` or safe defaults

Pitfalls:

- event creation depends on heuristic interpretation of `event_signal`, not a fully validated ontology
- changing `build_event_payload()` can silently alter event creation behavior across all net-new inbound mail
- date extraction is intentionally strict; looser parsing would increase false positives

### 4. Contact-event matching

Primary file:

- `agent/match.py`

Flow:

1. The job loads the Convex event.
2. It exits early if `needs_outreach` is false.
3. It fetches enriched contacts from Attio.
4. It builds compact summaries for the event and each contact.
5. Anthropic scores contacts and returns JSON rows with:
   - `attio_record_id`
   - `score`
   - `reasoning`
6. The output is parsed and converted into `event_outreach` suggestion rows in Convex.

Pitfalls:

- the parser assumes valid JSON; malformed output aborts the workflow
- score thresholds live in the prompt, not in post-processing code
- this is not reproducible scoring in the ML sense because prompt and model changes alter ranking behavior immediately

### 5. Outbound email composition

Primary file:

- `agent/outreach.py`

Flow:

1. Approved contacts are marked in Convex.
2. Event data is loaded once per job.
3. Each Attio contact is fetched and flattened.
4. The model receives a contact summary plus the event details.
5. Anthropic returns email body text only.
6. AgentMail sends the message.
7. Convex outreach metadata is updated with `agentmail_thread_id`.
8. An Attio note is appended for audit history.

Pitfalls:

- output is free-form text, so formatting regressions are possible even when the API call succeeds
- message sending is outside the general approval-gated conversational runtime
- contact flattening and email extraction are brittle integration points if Attio field shapes change

## Structured Outputs

The model-backed paths depend on a few fixed output contracts.

### Inbound classification contract

Expected normalized output:

```json
{
  "classification": "ACCEPTED | DECLINED | QUESTION | NEEDS_HUMAN",
  "reasoning": "short explanation",
  "speaker_confirmed": false,
  "room_confirmed": false,
  "event_signal": false,
  "timing_signal": false,
  "event_extract": {}
}
```

### Match output contract

Expected JSON array:

```json
[
  {
    "attio_record_id": "rec_x",
    "score": 7,
    "reasoning": "short justification"
  }
]
```

There is no strongly typed schema validator around either path today beyond basic Python normalization logic.

## Data Sources Used For Inference

The agent layer reads from:

- Convex events
- Convex outreach state
- Convex inbound receipts and assignments
- Attio people/contact records
- AgentMail thread history
- user prompt text in the conversational runtime

There is no offline feature table, embedding index, vector database, or model artifact registry in this repository.

## Error Handling Strategy

The implementation is intentionally conservative.

- conversational runtime without Anthropic credentials falls back to a plain explanatory assistant message
- inbound classification failures degrade to safe default decisions
- inbound processing uses a lease-based receipt mechanism so failed work can be retried
- unknown tool names fail explicitly in `execute_tool_call()`
- approval-gated paths prevent direct mutation from the conversational loop

The cost of this strategy is that silent quality degradation is possible unless operational logs are monitored.

## Known Weak Spots

- Prompt-defined contracts are not centrally versioned.
- JSON parsing is permissive but not fully schema-validated.
- Matching and composition are not deterministic across model revisions.
- Several workflows still write historical Attio fields that the current architecture wants to minimize or replace over time.
- There is no first-class evaluation harness for prompt quality, only unit tests around surrounding behavior.

## Resource And Cost Considerations

- `match.py` can produce large prompts because it serializes many contact summaries at once.
- `outreach.py` makes one model call per contact, so cost scales linearly with recipient count.
- inbound classification is cheaper because prompts are narrower, but thread history growth can still increase token usage.
- the conversational runtime limits turns and uses an in-process tool loop to keep execution bounded.

## Change Safety Rules

- Do not treat this layer like a standard backend helper library; prompt text is executable behavior.
- Do not move approval policy out of Modal runtime modules.
- Do not add write-capable tools without updating policy classification.
- Do not broaden exception swallowing without adding observability.
- Do not change classification labels casually; downstream mapping logic depends on the current vocabulary.

## File Map

| File | Role in the low-level ML layer |
|---|---|
| `agent/runtime/anthropic_adapter.py` | Main Anthropic tool-loop adapter for conversational runs |
| `agent/runtime/service.py` | Orchestrates runs, approvals, normalized state, and adapter calls |
| `agent/runtime/policy.py` | Classifies actions into read/write/send/destructive approval buckets |
| `agent/runtime/tool_executor.py` | Dispatch table from tool name to in-process handler |
| `agent/apps/mcp/service.py` | Concrete Attio and Convex tool implementations exposed to the agent |
| `agent/helper/email_parse.py` | Known-thread and net-new inbound classification plus event extraction helpers |
| `agent/helper/prompts/known_thread.txt` | System prompt for classifying replies on known outreach threads |
| `agent/helper/prompts/net_new.txt` | System prompt for classifying net-new inbound mail |
| `agent/match.py` | Event-contact ranking workflow using prompt-based scoring |
| `agent/outreach.py` | Personalized outbound email body generation |
| `agent/reply_handler.py` | Webhook entrypoint that routes inbound mail into classification pipelines |

