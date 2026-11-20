# Principled change

rule: A second special case for the same root cause means an earlier design choice is wrong. Reopen the choice instead of adding a third.

severity: escalate (medium)

## Signs in review

- A workaround whose comment points at another workaround for the same thing
- A new flag or exception added to a mechanism that already has one for the same reason

Doesn't count:

- One check that appears in two branches. If it's conceptually the same check, it's one special case, not two.
- A special case that makes incoherent existing code coherent. Coherently inelegant is better than elegantly incoherent. The PR should say that's what it's doing (see [explain-the-design](explain-the-design.md)).

## Example

Bad: a second `skipForInterception` check, added next to an existing `skipForParallelRoutes` check, both working around the same assumption that a URL maps to one tree.

Good: the PR names the assumption and either fixes it or says why not yet.

## Why

Each workaround passes review on its own, and the complexity adds up.
