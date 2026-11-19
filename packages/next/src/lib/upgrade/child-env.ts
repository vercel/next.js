let nodeEnvInjected = false

/**
 * Sets NODE_ENV for the CLI process when the user did not export one, and
 * remembers that the value was not theirs.
 *
 * The value is tracked separately from its contents because commands change it
 * again later: `next dev` turns it into `development`, and `next build
 * --debug-prerender` overrides the `production` default with `development`.
 * A child process cannot tell any of those values apart from one the user
 * exported, so ownership has to be recorded at injection time.
 */
export function injectNodeEnv(defaultEnv: 'development' | 'production'): void {
  if (process.env.NODE_ENV) {
    return
  }
  // `NODE_ENV` is readonly on the global type so application code cannot
  // mutate it. The CLI has to, because Next.js reads it before any user
  // config is loaded.
  // eslint-disable-next-line @next/internal/no-as-any
  ;(process.env as any).NODE_ENV = defaultEnv
  nodeEnvInjected = true
}

/**
 * Returns the environment to pass to the processes an upgrade spawns.
 *
 * The CLI sets NODE_ENV for itself before it offers an upgrade, and a child
 * process cannot tell that value apart from one the user exported. Drop the
 * value the CLI injected, so the upgrade and the coding agent it launches run
 * in the user's environment instead of inheriting development mode.
 */
export function getUpgradeChildEnv(): NodeJS.ProcessEnv {
  if (!nodeEnvInjected) {
    return process.env
  }

  const childEnv: Record<string, string | undefined> = { ...process.env }
  delete childEnv.NODE_ENV
  return childEnv as NodeJS.ProcessEnv
}
