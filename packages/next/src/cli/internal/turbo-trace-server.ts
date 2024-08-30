import { loadBindings } from '../../build/swc'

export async function startTurboTraceServerCli(file: string) {
  let bindings = await loadBindings()
  bindings.turbo.startTurbopackTraceServer(file)
}
