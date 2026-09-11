import { Sandbox as VercelSandbox } from '@vercel/sandbox'
import { SandboxManager, type SandboxOptions } from '@vercel/agent-eval'
import { setTimeout as delay } from 'node:timers/promises'

// Reconnect only reads of an already-started command. Retrying command creation
// could execute a migration twice after an ambiguous network failure.
export async function readCommand<T>(
  read: () => Promise<T>,
  stage: string
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      const cause = error as Error & {
        code?: string
        cause?: { code?: string }
      }
      const code = cause.code ?? cause.cause?.code
      const transient =
        (cause instanceof TypeError &&
          ['fetch failed', 'terminated'].includes(cause.message)) ||
        [
          'UND_ERR_SOCKET',
          'UND_ERR_CONNECT_TIMEOUT',
          'UND_ERR_HEADERS_TIMEOUT',
          'UND_ERR_BODY_TIMEOUT',
          'ECONNRESET',
          'ETIMEDOUT',
          'EAI_AGAIN',
        ].includes(code ?? '')
      if (!transient || attempt === 2) {
        throw new Error(
          `Sandbox ${stage} failed after ${attempt + 1} read attempt(s): ${code ?? cause.name}`,
          { cause: error }
        )
      }
      console.warn(
        `Sandbox ${stage}: reconnecting read (${code ?? cause.name}).`
      )
      await delay(500 * (attempt + 1))
    }
  }
}

// agent-eval 2.2.1 hardcodes the retired node24 runtime. Keep its upload,
// auth and grading lifecycle, adapting image creation and command-read recovery
// in this suite's dedicated process. Reassess when the runner supports both.
export const upgradeImage =
  'vercel/sandbox/node@sha256:07bbba46c01fc02c9cd7e2e1962fda825ff733c099212ade7f893966df949b78'

export async function withUpgradeSandbox<T>(run: () => Promise<T>): Promise<T> {
  const create = SandboxManager.create
  SandboxManager.create = async (options: SandboxOptions = {}) => {
    const token = options.token ?? process.env.VERCEL_TOKEN
    const teamId = options.teamId ?? process.env.VERCEL_TEAM_ID
    const projectId = options.projectId ?? process.env.VERCEL_PROJECT_ID
    const sandbox = await VercelSandbox.create({
      image: upgradeImage,
      persistent: false,
      timeout: options.timeout,
      ...(token && teamId && projectId ? { token, teamId, projectId } : {}),
    })
    // The manager uses only SDK operations shared by 1.8 and 3.2. Its declared
    // constructor type refers to its own older private SDK class.
    const manager = new SandboxManager(
      sandbox as unknown as ConstructorParameters<typeof SandboxManager>[0]
    )
    // agent-eval's older adapter retries socket termination but drops other
    // transient fetch failures, losing the live runner and its transcript.
    manager.runCommand = async (command, args = [], commandOptions = {}) => {
      const running = await sandbox.runCommand({
        cmd: command,
        args,
        env: commandOptions.env,
        cwd: commandOptions.cwd ?? manager.getWorkingDirectory(),
        detached: true,
      })
      const stage = `${command} (${running.cmdId})`
      const finished = await readCommand(
        () => running.wait(),
        `wait for ${stage}`
      )
      return {
        stdout: await readCommand(
          () => finished.stdout(),
          `stdout of ${stage}`
        ),
        stderr: await readCommand(
          () => finished.stderr(),
          `stderr of ${stage}`
        ),
        exitCode: finished.exitCode,
      }
    }
    manager.runShell = (command, env, cwd) =>
      manager.runCommand('bash', ['-c', command], { env, cwd })
    // The managed image starts in /app; agent-eval expects this upload root.
    const directory = await sandbox.runCommand('mkdir', [
      '-p',
      '/vercel/sandbox',
    ])
    if (directory.exitCode !== 0) {
      await sandbox.stop()
      throw new Error('Could not prepare the eval working directory')
    }
    // SDK 3 identifies sandboxes by name; the runner retains that identity in results.
    Object.defineProperty(manager, 'sandboxId', { get: () => sandbox.name })
    return manager
  }
  try {
    return await run()
  } finally {
    SandboxManager.create = create
  }
}
