/**
 * Returns a copy of `env` with `NODE_ENV` removed.
 *
 * `next dev` sets `NODE_ENV=development` for itself and exports it to child
 * processes. The processes spawned for an agent upgrade (the delegated
 * upgrade CLI and the coding agent it launches) must not inherit that value:
 * the agent's `next build` would run with the development configuration and
 * fail. Dropping the variable lets each child apply its own default instead
 * (`next build` defaults to production, `next dev` to development).
 */
export function stripNodeEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const childEnv = { ...env }
  delete childEnv.NODE_ENV
  return childEnv
}
