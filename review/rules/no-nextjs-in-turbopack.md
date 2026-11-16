# No Next.js in Turbopack

rule: Code under `turbopack/` stays general-purpose. It doesn't name, branch on, or encode Next.js concepts. When Next.js needs different behavior, Turbopack exposes a generic option, and the Next.js crates under `crates/` choose its value.

severity: escalate (strong). This applies even when the author owns the Turbopack area, because it's a rule, not an area signal.

Not in scope:

- Tooling that measures or reads Next.js output: `turbopack-bench`'s Next.js bundler, `turbopack-trace-server`'s Next.js trace reader.
- Removing Next.js concepts from `turbopack/`, or moving them into `crates/`.
- Comments that name Next.js as a consumer, as long as the code itself stays generic.

## Signs in review

- A new match on or construction of a Next.js-specific condition variant in `turbopack/` (such as `EntryReferenceSubType`, which already carries a `TODO` saying these values are Next.js-specific.)
- A new Next.js-specific variant, field, or type in a `turbopack/` crate: pages and app router, RSC or server-action layers, `next.config.js` options.
- Next.js file conventions or paths in `turbopack/` code: `pages/`, `app/`, `_app`, `_document`, `page.js`, `next/dist/...`.
- A `turbopack/` code path that only makes sense for one Next.js router or entry type.

## Example

Bad, in `turbopack/crates/turbopack/src/lib.rs`:

```rust
let is_page_entry = matches!(
    &reference_type,
    ReferenceType::Entry(
        EntryReferenceSubType::Page
            | EntryReferenceSubType::PageData
            | EntryReferenceSubType::PagesApi
    )
);
// ...
} else if follow_reexports && !is_page_entry {
```

Turbopack now knows what a Pages Router page is, and any new Next.js entry type needs another Turbopack change.

Good: Turbopack exposes the behavior as a generic input, such as an option on the entry or in the module options that says "don't split this entry into a facade". `crates/next-core` sets it when it creates page entries. Turbopack decides from the option, never from the kind of Next.js entry.

## Why

Turbopack is a general-purpose bundler (see `turbopack/AGENTS.md`). Next.js-specific branches in it couple the two layers, and they spread: each one is a precedent for the next, and they have to be untangled before Turbopack can be used or changed on its own. Moving the decision into `crates/` costs little when the change is made, and much more later.
