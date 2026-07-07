import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import picocolors from 'picocolors'
import { Interface } from '../index.js'
import { SnapshotRow, defaultSnapshotPath, writeSnapshot } from '../snapshot.js'
import { formatVariantProps } from '../utils.js'

const execFileAsync = promisify(execFile)

async function readGitInfo(): Promise<{ sha: string; branch: string }> {
  const sha = process.env.GITHUB_SHA || (await tryGit(['rev-parse', 'HEAD']))
  const branch =
    process.env.GITHUB_REF_NAME ||
    (await tryGit(['rev-parse', '--abbrev-ref', 'HEAD']))
  return { sha, branch }
}

async function tryGit(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args)
    return stdout.trim()
  } catch {
    return ''
  }
}

export default function createInterface(
  options: { path?: string } = {}
): Interface & { resolvedPath: string } {
  const path = options.path ?? defaultSnapshotPath()
  const rows: SnapshotRow[] = []
  const timestamp = new Date().toISOString()

  const iface: Interface & { resolvedPath: string } = {
    resolvedPath: path,
    variantStatistics: async (scenario, props, stats) => {
      const variant = formatVariantProps(props)
      for (const [metric, s] of Object.entries(stats)) {
        for (let i = 0; i < s.samples.length; i++) {
          rows.push({
            timestamp,
            scenario,
            variant,
            metric,
            sample_idx: i + 1,
            value: s.samples[i],
            unit: s.unit,
            relative_to: s.relativeTo ?? '',
            git_sha: '',
            git_branch: '',
          })
        }
      }
    },
    finish: async () => {
      if (rows.length === 0) return
      const { sha, branch } = await readGitInfo()
      for (const r of rows) {
        r.git_sha = sha
        r.git_branch = branch
      }
      await writeSnapshot(path, rows)
      console.log(picocolors.dim(`Wrote ${rows.length} rows to ${path}`))
    },
  }

  return iface
}
