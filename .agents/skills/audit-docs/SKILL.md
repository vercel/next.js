---
name: audit-docs
description: >
  Audit documentation files for technical accuracy, completeness, and audience
  appropriateness. Use when auditing .mdx files in docs/, verifying docs against
  source code, checking audience journeys, or reviewing documentation quality.
  Covers technical claim verification, audience analysis (beginner/intermediate/
  expert/LLM), knowledge graph generation, and prioritized fix recommendations.
argument-hint: '<file-paths...>'
user-invocable: true
---

# Review Documentation for Accuracy

Use this skill to review documentation files for technical accuracy, completeness, and audience appropriateness using the Next.js source code as the source of truth.

## Usage

```
/audit-docs [file-paths...]
```

Examples:

- `/audit-docs docs/01-app/03-api-reference/01-directives/use-cache.mdx`
- `/audit-docs docs/01-app/01-getting-started/05-server-and-client-components.mdx docs/01-app/01-getting-started/06-cache-components.mdx`

If no files are provided, prompt the user to specify which documentation files to review.

## Workflow

### Step 1: Read the documentation files

Read each specified documentation file completely.

### Step 2: Identify technical claims

Extract all technical claims from the documentation, including:

- API behaviors and signatures
- Configuration options and their effects
- Default values
- Error conditions and messages
- Performance characteristics
- Compatibility requirements

### Step 3: Verify against source code

For each technical claim, search `packages/next/src/` to verify accuracy.

Key directories to check:

- `packages/next/src/server/` - Server runtime behavior
- `packages/next/src/client/` - Client-side runtime
- `packages/next/src/build/` - Build-time behavior
- `packages/next/src/lib/` - Shared utilities

Document findings as:

- **Verified**: Claim matches source code (cite file:line)
- **Inaccurate**: Claim contradicts source code (cite evidence)
- **Unverifiable**: Cannot find source code to confirm
- **Outdated**: Source code has changed since docs were written

### Step 4: Analyze audience journeys

Evaluate the documentation for four audience types:

**Beginner** (new to Next.js):

- Are prerequisites explained?
- Is jargon defined on first use?
- Are there working examples they can copy?
- Is the learning path clear?

**Intermediate** (building production apps):

- Are common use cases covered?
- Are gotchas and edge cases documented?
- Is there guidance on best practices?
- Are performance implications explained?

**Expert** (deep customization needed):

- Are internals explained when relevant?
- Are escape hatches documented?
- Is the mental model accurate and complete?
- Are advanced patterns shown?

**LLM** (AI assistants using docs):

- Are concepts self-contained or require external context?
- Are relationships between concepts explicit?
- Is information structured for retrieval?
- Are examples complete and runnable?

### Step 5: Identify knowledge gaps

For each audience, identify:

- **Missing**: What information is completely absent?
- **Unclear**: What is present but confusing?
- **Contradictory**: What conflicts with other docs?
- **Unexplained**: What assumes knowledge not provided?

### Step 6: Generate knowledge graph

Create a concept map showing:

- **Concepts**: Key terms and features
- **Relationships**: How concepts connect (requires, enables, conflicts with, replaces)
- **Dependencies**: What must be understood first
- **Cross-references**: Links to related documentation

Format as a markdown table.

### Step 7: Prioritize fixes

Rank issues by impact:

**Critical** (blocking users):

- Technical inaccuracies that cause errors
- Missing essential information
- Contradictions with current behavior

**High** (causing confusion):

- Outdated examples
- Missing common use cases
- Unclear explanations

**Medium** (reducing quality):

- Missing edge cases
- Incomplete examples
- Missing cross-references

**Low** (polish):

- Stylistic improvements
- Additional examples
- Minor clarifications

## Output Format

Structure the review as:

```markdown
# Documentation Review: [file names]

## Technical Accuracy

### Verified Claims

| Claim | Source Code Reference |
| ----- | --------------------- |
| ...   | file.ts:123           |

### Inaccuracies Found

| Claim in Docs | Actual Behavior | Source Reference |
| ------------- | --------------- | ---------------- |
| ...           | ...             | file.ts:456      |

### Unverifiable Claims

- Claim (reason cannot verify)

## Audience Analysis

### Beginner

- Strengths: ...
- Gaps: ...

### Intermediate

- Strengths: ...
- Gaps: ...

### Expert

- Strengths: ...
- Gaps: ...

### LLM

- Strengths: ...
- Gaps: ...

## Knowledge Graph

| Concept | Type | Relates To | Relationship |
| ------- | ---- | ---------- | ------------ |
| ...     | ...  | ...        | requires     |

## Recommended Fixes

### Critical

1. [Issue]: [Fix] (file:line)

### High

1. [Issue]: [Fix]

### Medium

1. [Issue]: [Fix]

### Low

1. [Issue]: [Fix]
```

## Common Source Locations

- Cache/use cache: `packages/next/src/server/use-cache/`
- Server Components: `packages/next/src/server/app-render/`
- Client Components: `packages/next/src/client/`
- Configuration: `packages/next/src/server/config.ts`, `packages/next/src/server/config-shared.ts`
- Directives: `packages/next/src/build/analysis/`
