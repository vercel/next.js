import { loadBindings } from '../../build/swc'

/**
 * Starts the shared Turbopack daemon server listening on the given socket path.
 * This process runs until killed; it never returns from this function.
 */
export async function runTurbopackDaemon(socketPath: string): Promise<void> {
  const bindings = await loadBindings()
  await bindings.turbo.startTurbopackDaemon(socketPath)
}
