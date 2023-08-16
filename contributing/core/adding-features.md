# Adding a new feature

Anyone can propose a change to Next.js. However, adding new features often requires community discussions before proceeding with the implementation.

Therefore, before opening a PR, you should use the [Feature Request discussion template](https://github.com/vercel/next.js/discussions/new?category=ideas) and collect feedback.

## Why use a discussion?

The discussion's goal is to achieve the following:

1. **Verify the validity of the feature request**: The community can upvote discussions. Highly upvoted feature requests are more likely to be considered.
2. **Understanding the consequences**: Any feature added to Next.js is likely to be around for a while and _has to be maintained_. This means that a new feature has to cover many use cases, needs to consider how it affects the ecosystem, and so on.
3. **Looking at and understanding historical reasons for the current behavior or lack of the feature**: There might be a reason why a feature does not exist, or why the current implementation is in a certain way. There must be solid reasoning to change this, as the feature needs to be maintained even after it is added. (See 2.). Next.js has a strong policy on not breaking features, so any new feature has to be added in a way that makes it possible to incrementally adopt it.

## Examples

The Next.js team uses RFCs (Request For Comment), which you can find in [this discussion category](https://github.com/vercel/next.js/discussions/categories/rfc). Reading through these, you can get a better understanding of what is expected to be included in a good feature request.
