// This script must be run with tsx, e.g.:
//
//   tsx scripts/trace-to-event-format.ts <traceFilePath> [outFilePath] [configFilePath]
//
// It reads a Next.js `.next/trace` file (newline-separated JSON arrays of
// `TraceEvent`) and writes a Chrome JSON Trace Event Format file that can be
// loaded into Perfetto / chrome://tracing. The conversion algorithm itself
// lives in `packages/next/src/trace/to-chrome-event-format.ts` and is shared
// with the `next internal perfetto` CLI.

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { convertNextTraceToChromeEventFormat } from '../packages/next/src/trace/to-chrome-event-format'

async function main() {
  // Collect necessary default metadata. Script should pass cli args as in order of
  // - trace file to read
  // - output file path (optional)
  // - path to next.config.js (optional)
  const [, , traceFilePath, outFile, configFilePath] = process.argv

  if (!traceFilePath) {
    throw new Error(
      `Cannot collect traces without necessary metadata.
Try to run script with below args:

tsx scripts/trace-to-event-format.ts tracefilepath [outfilepath] [configfilepath]`
    )
  }

  const outFilePath = outFile ?? `${traceFilePath}.event`
  const config = configFilePath
    ? (await import(path.resolve(process.cwd(), configFilePath))).default
    : {}

  const trace = await convertNextTraceToChromeEventFormat(traceFilePath)

  // The Chrome Trace Event Format's "Object Format" lets us attach arbitrary
  // metadata via `otherData`, which Perfetto exposes under "Info and stats".
  // The previous version of this script appended a metadata `M` event with
  // `args: { config }`; `otherData` is the modern equivalent and avoids
  // emitting a synthetic event into the timeline.
  const output = {
    ...trace,
    otherData: { config },
  }

  await writeFile(outFilePath, JSON.stringify(output))
}

main().catch((e) => {
  console.error(`Failed to generate traces`)
  console.error(e)
  process.exit(1)
})
