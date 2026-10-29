# Typegen MCP and Agent Tooling

<!-- Owners and paths: the [typegen-mcp-and-agent-tooling] section of review/OWNERS. Owners: replace the TODOs. -->

## Context

- Dev-time integrations for editors and agents: the TypeScript language-service plugin, route/param type generation (`next typegen`), the dev MCP server, generated `AGENTS.md`/skills shipped with `next`, `next upgrade`, and the agent-feedback protocol.
- TODO: key files and the invariants that must hold

## What failure looks like

- Generated types reject valid user code (build fails on `next build` type-check), `next upgrade` picking the wrong version, shipped skills giving agents stale guidance.
- TODO: past regressions and reverts, with links

## Escalate when

- Changes to generated type output shape (strong: it is a public type contract).
- TODO

## Rules

- TODO

## Preferences

- TODO
