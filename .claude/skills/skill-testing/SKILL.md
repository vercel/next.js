---
name: nextjs-skill-testing
description: |
  Test runner for Next.js Claude skills. Validates skills against test cases.

  **PROACTIVE ACTIVATION**: When user asks to "test", "validate", or "check" a skill, or references a skill with testing intent.

  **DETECTION**: "test the X skill", "run tests on @skill-path", "validate skill", test results, TPR/FPR metrics.

  **USE CASES**: Running skill tests, validating skill quality, checking pattern coverage, generating test reports.
---

# Next.js Skill Test Runner

> **Auto-activation**: When asked to test or validate a Next.js skill from `.claude-plugin/plugins/`.

## Overview

This skill runs tests against Next.js skills and reports results with quality metrics.

## When to Use

- "Test the routing skill"
- "Run tests on @.claude-plugin/plugins/routing"
- "Validate the data-fetching skill"
- "Check if the routing skill passes all tests"

## Test Execution Process

### Step 1: Identify the Skill

From the user's reference, identify:

- **Skill ID**: e.g., `routing`, `data-fetching`
- **Skill Path**: `.claude-plugin/plugins/{skill-id}/skills/{skill-id}/SKILL.md`
- **Test Path**: `tests/{skill-id}.yaml`

### Step 2: Load the Skill

Read the skill's SKILL.md file to understand:

- Activation rules
- Detection patterns
- Code generation guidelines

### Step 3: Load Test Cases

Read `tests/{skill-id}.yaml` which contains:

```yaml
skill: { skill-id }

activation_tests:
  - id: test-name
    prompt: 'User request'
    context: 'Project context'
    expected:
      activated: true
      patterns_present: ['regex.*pattern']
      patterns_absent: ['bad.*pattern']

negative_tests:
  - id: should-not-activate
    prompt: 'Unrelated request'
    expected:
      activated: false

anti_pattern_tests:
  - id: avoid-mistake
    prompt: 'Request that might trigger mistakes'
    expected:
      patterns_absent: ['known.*mistake']
```

### Step 4: Execute Each Test

For each test case:

1. **Simulate the prompt** - Generate a response as if the skill is loaded
2. **Check patterns_present** - Verify all required patterns appear (regex match)
3. **Check patterns_absent** - Verify no forbidden patterns appear
4. **Record result** - PASS if all checks succeed, FAIL otherwise

### Step 5: Calculate Metrics

| Metric                 | Formula                                    | Target |
| ---------------------- | ------------------------------------------ | ------ |
| **TPR**                | correct_activations / expected_activations | >90%   |
| **FPR**                | false_activations / negative_tests         | <5%    |
| **Pattern Score**      | patterns_found / patterns_expected         | >85%   |
| **Anti-Pattern Score** | 1 - (anti_patterns_found / checked)        | >95%   |

### Step 6: Output Results

Generate a markdown report (see Output Format below).

## Output Format

```markdown
# Test Results: {skill-name}

**Skill**: `.claude-plugin/plugins/{skill-id}/`
**Tests**: `tests/{skill-id}.yaml`

## Summary

| Metric             | Value | Target | Status    |
| ------------------ | ----- | ------ | --------- |
| Activation TPR     | X%    | >90%   | PASS/FAIL |
| Activation FPR     | X%    | <5%    | PASS/FAIL |
| Pattern Score      | X%    | >85%   | PASS/FAIL |
| Anti-Pattern Score | X%    | >95%   | PASS/FAIL |

**Overall**: PASS/FAIL (X/Y tests passed)

## Test Details

### Test: {id}

**Prompt**: "{prompt}"
**Context**: {context}

**Response**:
(generated code block)

**Pattern Checks**:
| Pattern | Expected | Result |
|---------|----------|--------|
| pattern1 | Present | PASS |
| pattern2 | Absent | PASS |

**Result**: PASS (N/N patterns)
```

## Metrics Explained

### TPR - True Positive Rate

How often the skill activates when it should.

- **100%**: Always activates for valid requests
- **<90%**: Missing too many valid use cases - broaden activation rules

### FPR - False Positive Rate

How often the skill activates when it shouldn't.

- **0%**: Never activates for unrelated requests
- **>5%**: Too eager - narrow detection patterns

### Pattern Score

How well output matches expected code patterns.

- **100%**: All expected patterns present
- **<85%**: Guidelines not being followed - improve SKILL.md examples

### Anti-Pattern Score

How well output avoids known mistakes.

- **100%**: No mistakes generated
- **<95%**: Too many bad patterns - strengthen ANTI-PATTERNS.md

## Next.js Pattern Reference

### Common Patterns to Check

```yaml
# Imports (App Router)
- 'import.*Link.*from.*[''"]next/link[''"]'
- 'import.*useRouter.*from.*[''"]next/navigation[''"]'
- 'import.*usePathname.*from.*[''"]next/navigation[''"]'
- 'import.*Image.*from.*[''"]next/image[''"]'

# Next.js 15 async params
- 'params.*Promise'
- 'await params'
- 'await searchParams'

# File conventions
- "\\[.*\\]" # Dynamic routes [param]
- "\\[\\.\\.\\..*\\]" # Catch-all [...slug]

# Client components
- "'use client'"
```

### Common Anti-Patterns

```yaml
# Wrong imports (App Router)
- 'from.*[''"]next/router[''"]'

# Raw anchors instead of Link
- '<a href="/'

# Direct params access (Next.js 15)
- "params\\.[a-z]+[^)]" # Without destructuring after await
```

## Example Test Run

**User**: "Test the routing skill"

**Process**:

1. Load `.claude-plugin/plugins/routing/skills/routing/SKILL.md`
2. Load `tests/routing.yaml`
3. Execute 11 activation tests, 5 negative tests, 3 anti-pattern tests
4. Calculate metrics
5. Output results

## Available Skills to Test

| Skill            | Path                                       | Test File            |
| ---------------- | ------------------------------------------ | -------------------- |
| routing          | `.claude-plugin/plugins/routing/`          | `tests/routing.yaml` |
| cache-components | `.claude-plugin/plugins/cache-components/` | (create tests)       |

## Creating New Test Files

See `tests/routing.yaml` as a template. Each skill should have:

- At least 5 activation tests (main use cases)
- At least 3 negative tests (similar but different tasks)
- At least 2 anti-pattern tests (common mistakes)
