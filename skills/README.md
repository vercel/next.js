# Next.js Agent Skills

Official [Agent Skills](https://code.claude.com/docs/en/skills) for working on
Next.js projects. Distributed as a plugin to Claude Code and Codex.

`next.js/skills/` is the **canonical source**. Each platform consumes it from
here — there is no separate copy to keep in sync beyond what's described below.

## Skills

| Skill | What it does |
| --- | --- |
| `next-dev-loop` | Edit→verify rhythm under `next dev`: confirm a change works at runtime, combining `/_next/mcp` (Next.js's own view) with `agent-browser` (the browser's view). |
| `next-cache-components-optimizer` | Optimize a `cacheComponents: true` app — grow the static shell (PPR) or make in-app navigation instant. |
| `next-feedback` | File Next.js framework feedback at the end of a session. |

## How each platform consumes it

### Claude Code

The Claude plugin **is** this directory. The community marketplace references
`vercel/next.js` via a `git-subdir` source (`path: skills`), so there is no
copy — it points straight at the monorepo.

- Manifest: [`.claude-plugin/plugin.json`](./.claude-plugin/plugin.json) with
  `"skills": "./"`, so the skill folders here are discovered directly (no
  nested `skills/skills/`).
- Skills install namespaced under the plugin name, e.g. `next:next-dev-loop`.

Validate locally before submitting:

```bash
claude plugin validate ./skills --strict
```

Test load in a real session:

```bash
claude --plugin-dir ./skills
# /next:next-dev-loop , /next:next-cache-components-optimizer , /next:next-feedback
```

### Codex

Codex skills use the same `SKILL.md` format, so the skill content is shared
verbatim. They live in an OpenAI-provisioned repo (Codex's repo-scope skill
dir is `.agents/skills/`); the `SKILL.md` folders are copied in there and a PR
is opened for review.

## Updating

Edit the skills here in `next.js/skills/`. For Claude, pushing to `vercel/next.js`
is enough — approved plugins are pinned to a commit SHA in the community catalog
and CI bumps the pin as new commits land (pin an explicit `version` in
`plugin.json` if you want to gate which commits ship as updates). For Codex,
copy the changed `SKILL.md` folders into the OpenAI repo and open a PR.
