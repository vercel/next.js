/**
 * Reads the runtime logs of a deployment with `vercel logs --json`.
 *
 * The output is JSON Lines: one `{ type, data }` record per log entry (its
 * message in `data.message`), `warning` records, and a final `summary` record
 * with the pagination cursor. An error is a `{ status: 'error' }` object.
 */

export interface VercelCliResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut?: boolean
}

/** Runs `vercel` with `args`, killing it after `timeoutMs`. */
export type RunVercelCli = (
  args: string[],
  timeoutMs: number
) => Promise<VercelCliResult>

export interface ReadVercelRuntimeLogsOptions {
  /** The deployment URL. */
  deployment: string
  since: Date
  /** Filters the messages by bare words (e.g. a trace ID). */
  query?: string
  /** Global flags (e.g. `--scope`, `--token`), appended to every command. */
  flags?: string[]
  /** When reading must be done (a `Date.now()` timestamp), across all pages. */
  deadline: number
  /** How many pages to read at most. */
  maxPages?: number
}

/**
 * The messages of the deployment's runtime logs since `since`, of all its
 * functions (including middleware). Throws when the logs can't be read
 * completely: the command fails or doesn't finish before `deadline`, the
 * output isn't JSON, the logs have gaps, a message was truncated, or there
 * are more pages than `maxPages`.
 */
export async function readVercelRuntimeLogs(
  run: RunVercelCli,
  {
    deployment,
    since,
    query,
    flags = [],
    deadline,
    maxPages = 20,
  }: ReadVercelRuntimeLogsOptions
): Promise<string[]> {
  const messages: string[] = []
  let args = [
    'logs',
    '--deployment',
    deployment,
    '--since',
    since.toISOString(),
    '--limit',
    '10000',
    ...(query ? ['--query', query] : []),
    '--json',
    ...flags,
  ]
  for (let page = 1; page <= maxPages; page++) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      throw new Error(
        `vercel logs didn't finish before the deadline (page ${page})`
      )
    }
    const res = await run(args, remainingMs)
    if (res.timedOut || res.exitCode !== 0) {
      throw new Error(
        `vercel logs failed (${res.timedOut ? 'timed out' : `exit code ${res.exitCode}`}): ${res.stderr}\n${res.stdout}`
      )
    }

    let summary: any
    for (const line of res.stdout.split('\n')) {
      if (!line.trim()) {
        continue
      }
      let record: any
      try {
        record = JSON.parse(line)
      } catch {
        throw new Error(`vercel logs printed non-JSON output: ${line}`)
      }
      if (record?.status === 'error') {
        throw new Error(
          `vercel logs failed (${record.reason}): ${record.message}`
        )
      }
      if (record?.type === 'summary') {
        summary = record
      } else if (record?.type === 'warning') {
        if (record.reason === 'stream_gap') {
          throw new Error(`vercel logs has a stream gap: ${record.message}`)
        }
      } else if (typeof record?.data?.message === 'string') {
        if (record.data.truncated) {
          throw new Error(
            `vercel logs returned a truncated message: ${record.data.message}`
          )
        }
        messages.push(record.data.message)
      }
    }

    if (!summary) {
      throw new Error(`vercel logs printed no summary: ${res.stdout}`)
    }
    if (summary.outputIncomplete) {
      throw new Error('vercel logs output is incomplete')
    }
    if (summary.excludedIntervals?.length > 0) {
      throw new Error(
        `vercel logs excluded intervals: ${JSON.stringify(summary.excludedIntervals)}`
      )
    }
    if (!summary.pagination?.hasMore) {
      return messages
    }
    const next = summary.pagination.next
    if (!next) {
      throw new Error(
        'vercel logs has more records but no pagination cursor to read them'
      )
    }
    args = ['logs', '--next', next, '--json', ...flags]
  }
  throw new Error(
    `vercel logs has more than ${maxPages} pages (pagination limit reached)`
  )
}
