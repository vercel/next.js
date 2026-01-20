## Claude Skills System

This repository includes a Claude skills system that provides AI assistants with expert knowledge about Next.js framework features.

### What are Claude Skills?

Skills are structured markdown files that give Claude specialized knowledge about specific topics. When a skill is loaded, Claude follows its guidelines for code generation, patterns, and best practices.

### Directory Structure

```
.claude/skills/                    # Meta-skills (for skill creation/testing)
├── doc-to-skill/                  # Generates skills from /docs
│   ├── SKILL.md
│   ├── skill-registry.yaml
│   └── templates/
└── skill-testing/                 # Tests skills against test cases
    └── SKILL.md

.claude-plugin/plugins/            # Generated Next.js skills
├── routing/
│   ├── .claude-plugin/plugin.json
│   ├── README.md
│   └── skills/routing/
│       ├── SKILL.md               # Core concepts, quick start
│       ├── REFERENCE.md           # API documentation
│       ├── PATTERNS.md            # Best practices, recipes
│       ├── ANTI-PATTERNS.md       # Common mistakes to avoid
│       └── TROUBLESHOOTING.md     # Error solutions
├── cache-components/
└── ... (other skills)

tests/                             # Skill test cases
└── routing.yaml
```

### Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| **routing** | App Router navigation, Link, useRouter, dynamic routes | Ready |
| **cache-components** | Cache Components, PPR, cacheLife, cacheTag | Ready |

### How to Use Skills

Reference a skill in your prompt to Claude:

```
"Using the routing skill, create a navigation menu"
```

Or reference the skill path:

```
"@.claude-plugin/plugins/routing - add a dynamic blog route"
```

### Creating New Skills

Use the `doc-to-skill` meta-skill:

```
"Generate the data-fetching skill from the docs"
```

This reads from `/docs` and `/errors` to create comprehensive skill files.

### Testing Skills

Use the `skill-testing` skill:

```
"Test the routing skill"
```

This runs test cases from `tests/{skill-id}.yaml` and reports:

| Metric | Target | Description |
|--------|--------|-------------|
| TPR | >90% | Activation accuracy |
| FPR | <5% | False activation rate |
| Pattern Score | >85% | Code pattern coverage |
| Anti-Pattern Score | >95% | Mistake avoidance |

### Skill File Reference

| File | Purpose |
|------|---------|
| `SKILL.md` | Core concepts, quick start, activation rules, code guidelines |
| `REFERENCE.md` | API signatures, parameters, return values, examples |
| `PATTERNS.md` | Best practices, common recipes, recommended approaches |
| `ANTI-PATTERNS.md` | Common mistakes with BAD/GOOD code examples |
| `TROUBLESHOOTING.md` | Error messages, debugging checklist, solutions |

### Adding Test Cases

Create `tests/{skill-id}.yaml`:

```yaml
skill: my-skill

activation_tests:
  - id: basic-test
    prompt: "User request"
    context: "Next.js 15 app router"
    expected:
      activated: true
      patterns_present:
        - "expected.*pattern"
      patterns_absent:
        - "bad.*pattern"

negative_tests:
  - id: should-not-activate
    prompt: "Unrelated request"
    expected:
      activated: false
```
