# Skills Authoring Guide

Skills are on-demand context files that Claude loads when relevant. They extend `AGENTS.md` with deep-dive workflows, code templates, and verification steps.

## When to Create a Skill

Create a skill when content is:
- **Too detailed for AGENTS.md** (code templates, multi-step workflows, diagnostic procedures)
- **Only relevant for specific tasks** (not every session needs it)
- **Self-contained enough to load independently**

Do NOT create a skill for:
- One-liner rules or guardrails (keep those in AGENTS.md)
- Content every agent session needs (that's what AGENTS.md is for)
- Simple facts without actionable steps

## File Structure

```
.agents/skills/
├── my-skill/
│   └── SKILL.md          # Required: frontmatter + content
│   └── workflow.md        # Optional: supplementary files
│   └── examples.md        # Optional: referenced from SKILL.md
└── README.md              # This file
```

## SKILL.md Format

```yaml
---
name: my-skill
description: >
  What this skill covers and when to use it. Include key file names,
  concepts, and trigger phrases so Claude can match user intent to this
  skill. This is the primary field Claude uses for auto-activation.
---
```

### Supported Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill name, used for `$name` references and `/name` slash commands |
| `description` | Yes | What the skill does and when to use it. **This is how Claude decides to auto-load the skill.** Include file names, concepts, and keywords. |
| `argument-hint` | No | Hint for expected arguments in autocomplete |
| `user-invocable` | No | Set to `false` to hide from `/` slash command menu |
| `disable-model-invocation` | No | Set to `true` to prevent Claude from auto-triggering this skill |
| `allowed-tools` | No | Tools Claude can use without permission when this skill is active |
| `model` | No | Model override for this skill |
| `context` | No | Set to `fork` for isolated subagent execution |
| `agent` | No | Subagent type to use with `context: fork` |
| `hooks` | No | Hooks scoped to this skill's lifecycle |

Only use fields from this table. Unknown fields are ignored by Claude Code.

### Writing Good Descriptions

The `description` is the single most important field. Claude uses it to decide when to auto-load the skill. Include:

- **What the skill covers** (the topic)
- **When to use it** (the trigger scenario)
- **Key file names** mentioned in the skill (e.g. `config-shared.ts`, `entry-base.ts`)
- **Key concepts/keywords** a user or agent might mention (e.g. "DCE", "feature flag", "vendored React")

```yaml
# Bad: too vague, won't match well
description: Helps with flags.

# Good: specific, includes file names and keywords
description: >
  How to add or modify Next.js experimental feature flags end-to-end.
  Use when editing config-shared.ts, config-schema.ts, define-env-plugin.ts,
  next-server.ts, export/worker.ts, or module.compiled.js.
```

## Content Guidelines

### Relationship to AGENTS.md

AGENTS.md holds **always-loaded guardrails** (one-liner rules every session needs). Skills hold **deep-dive content** loaded on demand.

- AGENTS.md should have a one-liner version of any critical rule
- Skills expand on those rules with verification steps, code examples, and context
- AGENTS.md points to skills via `$skill-name` references
- Skills should not duplicate AGENTS.md content; they should go deeper

### Structure a Skill for Action

Skills should tell the agent what to **do**, not just what to **know**:

- Lead with a clear "Use this skill when..." statement
- Include step-by-step procedures where applicable
- Add code templates ready to adapt
- End with verification commands
- Cross-reference related skills with a "Related Skills" section

### Naming

- Use short, descriptive names scoped to the topic: `flags`, `dce-edge`, `react-vendoring`
- No repo-name prefix (skills are already scoped to this repo by being in `.agents/skills/`)
- Use hyphens for multi-word names

### Supplementary Files

For complex skills, split into a hub SKILL.md + detail files:

```
pr-status-triage/
├── SKILL.md         # Overview + quick commands
├── workflow.md      # Detailed prioritization and patterns
└── local-repro.md   # CI env matching guide
```

Reference detail files from SKILL.md with relative links. Keep SKILL.md scannable as an entry point.
