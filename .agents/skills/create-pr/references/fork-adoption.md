# Adopt a fork PR

Use adoption when a maintainer needs deploy tests on an external contribution.
Adoption makes the contributor's code eligible to run in CI with repository
secrets. Treat the entire diff as untrusted regardless of which files it changes.

1. Run `pnpm pr-adopt <pr-number> --dry-run` to inspect the source, head SHA,
   target branch, and files without pushing or opening a PR.
2. Read the full diff with `gh pr diff <pr-number> --repo vercel/next.js`, and
   verify the PR head before and after review. Do not proceed if the diff is
   incomplete or the head does not match the reviewed SHA.
3. Run `pnpm pr-adopt <pr-number>` in an interactive terminal so the maintainer
   can verify the head SHA shown and personally confirm by typing the author's
   handle. Never supply the answer for them or bypass the prompt. If the head
   differs from the reviewed SHA, stop and review the new diff. The script
   checks the fetched head again after confirmation and aborts on a mismatch.

The [script](../../../../scripts/adopt-pr.js) preserves authorship and the tree
when re-signing commits and isolates Git operations in a temporary worktree with
hooks disabled. It accepts draft and closed PRs but rejects merged ones. It pushes
`adopt/<pr-number>` in `vercel/next.js` and opens a draft against the original
base. The replacement body is the original contributor's description verbatim
after `Adopts #N. Closes #N.`; leave that text intact.
