---
"next": patch
---

fix(turbopack): patch lightningcss to handle unparseable @container conditions

When error_recovery is enabled (used by Turbopack), the lightningcss CSS parser
would fail on valid CSS containing `@container <name> { ... }` named container
queries, reporting "Unexpected end of input". This patch fixes the parser to use
ContainerCondition::Unknown for unparseable conditions when error_recovery is enabled.

Fixes #98261
