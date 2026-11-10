# Agent code review

Vercel Agent reviews PRs from the Next.js team and approves most of them. Humans review the rest.

- The agent reads [REVIEW.md](../REVIEW.md), then the rubric for each area the PR touches
- It approves by default, and escalates to an area owner when a PR hits enough escalation signals
- Escalation requests a review. It doesn't block the PR.
- The author still merges, and owns the outcome if something goes wrong

## Layout

- [`REVIEW.md`](../REVIEW.md): the protocol, severity levels, escalation triggers, an index of every rule (one line each, with its signs), and how areas and owners are picked
- `review/rules/*.md`: one rule per file, with signs in review, a good/bad example, and the why. The agent opens one when its signs match.
- `review/areas/*.md`: one rubric per area, written by its owners
- [`review/areas/_template.md`](areas/_template.md): start here for a new area
- [`review/rule-changes.md`](rule-changes.md): how changes to any of the above are reviewed

Reviews currently run in a single pass. The index in `REVIEW.md` has to be enough to spot a likely problem and route the PR; the rule files carry the detail, so they're only loaded when needed.

## Owning an area

- An area is whatever slice of the codebase you want to own: a directory, a feature that spans several, or one file
- Areas can overlap. A PR matching several gets all their rubrics.
- To add one:
  1. Copy `_template.md` to `review/areas/<area>.md` and fill it in
  2. Add a `[<area>] @you` section with your paths to [`review/OWNERS`](OWNERS)
- Owners:
  - are the human reviewer when their area escalates
  - are responsible for the health of their area's review process: if the agent gets something wrong in your area, fix the rubric

## Writing a good rubric

Every line gets read on every PR that touches your area. Keep it short.

- Write for a strong engineer who's new to your area. Context beats rules.
- Say what failure looks like: the bugs and regressions that actually happen here. Link past PRs and issues.
- Be specific: name the files, functions, and invariants.
- Say when to escalate, not just what to check. "Always escalate" for a whole area means every PR there waits for a human.
- Don't repeat `REVIEW.md` or anything CI already enforces.
- Include at least one good/bad example, written out in full. Put further examples in a short "More examples" bulleted list, one line each, so there's room to add more without costing much context.
- Give every rule a severity: escalate (strong or medium), comment, or nit.

## When the agent gets it wrong

Both directions count: a bad approval, or an escalation that wasted someone's time.

- Post it in `#TODO` with a link to the PR
- Update `REVIEW.md` or the area rubric
- Changes to `REVIEW.md` and `review/**` always escalate, so a PR can't approve its own criteria. They're reviewed against [rule-changes.md](rule-changes.md).
