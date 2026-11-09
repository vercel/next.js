import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { effort } from '../lib/effort.mjs'
import { parse } from 'dotenv'

function read(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

export function summarize(directory, pricing) {
  const result = read(join(directory, 'result.json'))
  let raw = ''
  try {
    raw = readFileSync(join(directory, 'transcript-raw.jsonl'), 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const measurementError = read(join(directory, 'metrics-error.json'), null)
  return {
    model: result.model,
    status: result.status,
    runnerSeconds: result.duration,
    agentSeconds:
      read(join(directory, 'project/.eval-metrics.json'), null)?.agentSeconds ??
      null,
    ...effort(raw, pricing),
    pageMeasurements: measurementError
      ? null
      : read(join(directory, 'measurements.json'), null),
    measurementError,
  }
}

export async function collect(directory, collector, pricing) {
  const result = read(join(directory, 'result.json'))
  // Preserve effort for failed attempts without treating a broken app as a pass.
  if (result.status === 'passed') {
    try {
      const { collect } = await import(`./${collector}.mjs`)
      await collect(directory)
      rmSync(join(directory, 'metrics-error.json'), { force: true })
    } catch (error) {
      writeFileSync(
        join(directory, 'metrics-error.json'),
        JSON.stringify({ message: String(error) })
      )
      writeFileSync(
        join(directory, 'metrics.json'),
        JSON.stringify(summarize(directory, pricing), null, 2) + '\n'
      )
      throw error
    }
  }
  const summary = summarize(directory, pricing)
  writeFileSync(
    join(directory, 'metrics.json'),
    JSON.stringify(summary, null, 2) + '\n'
  )
  return summary
}

export function findRuns(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['project', 'harness', 'workspace'].includes(entry.name)) return []
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? findRuns(path)
      : entry.name === 'result.json'
        ? [directory]
        : []
  })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, directory, collector, pricingPath] = process.argv.slice(2)
  if (
    !['collect', 'report'].includes(mode) ||
    !directory ||
    (mode === 'collect' && !/^[a-z0-9-]+$/.test(collector ?? ''))
  ) {
    throw new Error(
      'Usage: report.mjs collect <run-directory> <collector> [pricing.json] | report <results-directory>'
    )
  }
  const pricing = pricingPath ? read(pricingPath).pricing : null
  if (mode === 'collect') {
    // Mirror normal local eval setup, loading only Sandbox authentication.
    if (!process.env.VERCEL_OIDC_TOKEN) {
      for (const file of ['.env.local', '.env']) {
        try {
          const token = parse(readFileSync(file)).VERCEL_OIDC_TOKEN
          if (token) {
            process.env.VERCEL_OIDC_TOKEN = token
            break
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
    }
    if (!process.env.VERCEL_OIDC_TOKEN)
      throw new Error('Missing Sandbox VERCEL_OIDC_TOKEN')
    await collect(resolve(directory), collector, pricing)
  } else
    console.log(
      JSON.stringify(
        findRuns(resolve(directory)).map((run) => ({
          run,
          ...(read(join(run, 'metrics.json'), null) ?? summarize(run, pricing)),
        })),
        null,
        2
      )
    )
}
