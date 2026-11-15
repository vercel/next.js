# Motivated changes

rule: The description says what changed and why, so someone outside the team can follow it.

severity: escalate (strong) for a behavior change with no stated reason. Otherwise, comment.

## Signs in review

- A change to defaults, timing, caching, error behavior, or output with no "why" in the description
- A description that only restates the diff ("Update `foo` to call `bar`")
- Anything the diff changes in behavior that the description doesn't mention

## Example

Bad:

> Change default `staleTimes.dynamic` to 30.

Good:

> Change default `staleTimes.dynamic` from 0 to 30. Back/forward navigations refetched dynamic pages that hadn't changed, which made back navigation slow on most apps (#12345). 30s matches the static default's reasoning: short enough that users don't see stale data across visits. Apps that need 0 can still set it.

This PR still escalates, because changing a default is a public-behavior trigger. The description is what lets the owner review it quickly.

## Why

The description is the historical record. It's how the next person learns why the code is the way it is.
