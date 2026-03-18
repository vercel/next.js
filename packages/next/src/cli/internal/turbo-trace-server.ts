import { loadBindings } from '../../build/swc'

export async function startTurboTraceServerCli(
  file: string,
  port: number | undefined
) {
  let bindings = await loadBindings()
  bindings.turbo.startTurbopackTraceServer(file, port)
}
