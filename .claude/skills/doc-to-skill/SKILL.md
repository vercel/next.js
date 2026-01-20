---
name: doc-to-skill
description: |
  Converts Next.js documentation into self-contained Claude skills.
  **PROACTIVE ACTIVATION**: When user asks to generate/create a skill from docs.
  **DETECTION**: Requests for skill creation or doc-to-skill conversion.
  **USE CASES**: Creating Next.js framework skills from /docs and /errors.
---

# Doc-to-Skill Generator

## Overview

Converts Next.js documentation into distributable Claude skills.

## Output Structure

```
.claude-plugin/plugins/{skill-id}/
├── .claude-plugin/plugin.json
├── README.md
└── skills/{skill-id}/
    ├── SKILL.md
    ├── REFERENCE.md
    ├── PATTERNS.md
    ├── ANTI-PATTERNS.md
    └── TROUBLESHOOTING.md
```

## Source Mapping

| Source                          | Target             | Content               |
| ------------------------------- | ------------------ | --------------------- |
| docs/01-app/01-getting-started/ | SKILL.md           | Overview, quick start |
| docs/01-app/02-guides/          | PATTERNS.md        | Best practices        |
| docs/01-app/03-api-reference/   | REFERENCE.md       | API docs              |
| errors/\*.mdx                   | TROUBLESHOOTING.md | Errors                |
| (derived)                       | ANTI-PATTERNS.md   | Mistakes              |

## Process

1. Read skill-registry.yaml for source files
2. Read each source MDX file
3. Generate files using templates in templates/
4. Validate against quality checklist below

## Templates

See templates/ folder for exact format of each file type.

## Quality Checklist

### Structure

- [ ] All 5 skill files present
- [ ] plugin.json valid
- [ ] SKILL.md has frontmatter

### SKILL.md

- [ ] ASCII diagram
- [ ] Copy-paste quick start
- [ ] Specific activation rules
- [ ] Numbered guidelines

### REFERENCE.md

- [ ] Import, signature, params, examples per API
- [ ] Accurate TypeScript types

### PATTERNS.md

- [ ] 3-5+ patterns with working code
- [ ] Simple to complex progression

### ANTI-PATTERNS.md

- [ ] 3+ anti-patterns
- [ ] BAD/GOOD code pairs
- [ ] Detection hints

### TROUBLESHOOTING.md

- [ ] Debugging checklist
- [ ] Errors with symptoms/cause/solution

### Self-Contained

- [ ] NO external links
- [ ] All content inlined
