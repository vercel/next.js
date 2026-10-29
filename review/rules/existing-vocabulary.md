# Existing vocabulary

rule: Use the codebase's existing words, or prior art's, for things. Don't coin terms.

severity: comment

## Signs in review

- A new term for something that already has a name in the codebase or the docs
- A word that lives in one function or one PR

## Example

Bad: a new `pageSnapshot` type that's the same thing the router calls a `CacheNode`.

Good: reuse `CacheNode`, or say what's different about it.

## Why

Every new word is one more thing each reader has to learn.
