---
name: authoring-skills
description: >
  How to create and maintain agent skills in .agents/skills/. Use when
  creating a new SKILL.md, writing skill descriptions, choosing frontmatter
  fields, or deciding what content belongs in a skill vs AGENTS.md.
  Covers the supported spec fields, description writing, naming conventions,
  and the relationship between always-loaded AGENTS.md and on-demand skills.
user-invocable: false
---

# Authoring Skills

Use this skill when creating or modifying agent skills in `.agents/skills/`.

## When to Create a Skill

Create a skill when content is:

- Too detailed for AGENTS.md (code templates, multi-step workflows, diagnostic procedures)
- Only relevant for specific tasks (not needed every session)
- Self-contained enough to load independently

Keep in AGENTS.md instead when:

- It's a one-liner rule or guardrail every session needs
- It's a general-purpose gotcha any agent could hit

## File Structure

```
.agents/skills/
└── my-skill/
    ├── SKILL.md          # Required: frontmatter + content
    ├── workflow.md        # Optional: supplementary detail
    └── examples.md        # Optional: referenced from SKILL.md
```

## Supported Frontmatter Fields

```yaml
---
name: my-skill # Required. Used for $name references and /name commands.
description: > # Required. How Claude decides to auto-load the skill.
  What this covers and when to use it. Include file names and keywords.
argument-hint: '<pr-number>' # Optional. Hint for expected arguments.
user-invocable: false # Optional. Set false to hide from / menu.
disable-model-invocation: true # Optional. Set true to prevent auto-triggering.
allowed-tools: [Bash, Read] # Optional. Tools allowed without permission.
model: opus # Optional. Model override.
context: fork # Optional. Isolated subagent execution.
agent: Explore # Optional. Subagent type (with context: fork).
---
```

Only use fields from this list. Unknown fields are silently ignored.

## Writing Descriptions

The `description` is the primary matching surface for auto-activation. Include:

1. **What the skill covers** (topic)
2. **When to use it** (trigger scenario)
3. **Key file names** the skill references (e.g. `config-shared.ts`)
4. **Keywords** a user or agent might mention (e.g. "feature flag", "DCE")

```yaml
# Too vague - won't auto-trigger reliably
description: Helps with flags.

# Good - specific files and concepts for matching
description: >
  How to add or modify Next.js experimental feature flags end-to-end.
  Use when editing config-shared.ts, config-schema.ts, define-env-plugin.ts.
```

## Content Conventions

### Structure for Action

Skills should tell the agent what to **do**, not just what to **know**:

- Lead with "Use this skill when..."
- Include step-by-step procedures
- Add code templates ready to adapt
- End with verification commands
- Cross-reference related skills in a "Related Skills" section

### Relationship to AGENTS.md

| AGENTS.md (always loaded)               | Skills (on demand)                                                     |
| --------------------------------------- | ---------------------------------------------------------------------- |
| One-liner guardrails                    | Step-by-step workflows                                                 |
| "Keep require() behind if/else for DCE" | Full DCE pattern with code examples, verification commands, edge cases |
| Points to skills via `$name`            | Expands on AGENTS.md rules                                             |

When adding a skill, also add a one-liner summary to the relevant AGENTS.md section with a `$skill-name` reference.

### Naming

- Short, descriptive, topic-scoped: `flags`, `dce-edge`, `react-vendoring`
- No repo prefix (already scoped by `.agents/skills/`)
- Hyphens for multi-word names

### Supplementary Files

For complex skills, use a hub + detail pattern:

```
pr-status-triage/
├── SKILL.md         # Overview, quick commands, links to details
├── workflow.md      # Prioritization and patterns
└── local-repro.md   # CI env matching
```
