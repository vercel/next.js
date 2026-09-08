#!/usr/bin/env node

// Run in a bootstrapped checkout with no other writers to packages/next/dist.
// cargo build -p next-taskr --release
// node scripts/benchmark-taskr.js /absolute/path/to/results
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const { performance } = require('perf_hooks')
const { createHash } = require('crypto')
const { compare, snapshot } = require('./taskr-parity')

const root = path.resolve(__dirname, '..')
const output = path.resolve(process.argv[2] || '/tmp/next-taskr-benchmark')
const resume = process.argv.includes('--resume')
const cooldownMs = Number(
  process.argv.find((arg) => arg.startsWith('--cooldown-ms='))?.split('=')[1] ||
    0
)
const binary = path.resolve(
  root,
  process.env.NEXT_TASKR_BINARY || 'target/release/next-taskr'
)
const cache = path.join(root, 'packages/next/.cache/next-taskr')
const backup = path.join(output, 'cache-backup')
const dist = path.join(root, 'packages/next/dist')
const reference = path.join(output, 'reference')
const env = {
  ...process.env,
  NEXT_TASKR_BINARY: binary,
  PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
}
const orders = [
  ['taskr', 'rust-cold', 'rust-warm'],
  ['rust-cold', 'rust-warm', 'taskr'],
  ['rust-warm', 'taskr', 'rust-cold'],
  ['taskr', 'rust-warm', 'rust-cold'],
  ['rust-warm', 'rust-cold', 'taskr'],
  ['rust-cold', 'taskr', 'rust-warm'],
]
let coldTransformCount

// Allow only the reported ID spelling and the corresponding generated-column
// shifts in source maps. Other bytes in these files must still agree.
function canonicalCode(code) {
  const removed = []
  const lines = code.split('\n').map((line, index) => {
    removed[index] = []
    return line.replace(/\.\.\/lib\/trace\/tracer/g, (match, offset) => {
      removed[index].push(offset + 1)
      return './lib/trace/tracer'
    })
  })
  return { code: lines.join('\n'), removed }
}

function decodeSegment(segment) {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const values = []
  let value = 0
  let shift = 0
  for (const character of segment) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) throw new Error('Invalid source-map VLQ')
    value += (digit & 31) * 2 ** shift
    if (digit & 32) shift += 5
    else {
      values.push(value & 1 ? -(value >> 1) : value >> 1)
      value = shift = 0
    }
  }
  if (shift) throw new Error('Incomplete source-map VLQ')
  return values
}

function canonicalMap(map, removed) {
  const metadata = JSON.parse(
    JSON.stringify(map).replace(
      /\.\.\/lib\/trace\/tracer/g,
      './lib/trace/tracer'
    )
  )
  delete metadata.mappings
  const mappings = map.mappings.split(';').map((line, lineIndex) => {
    let column = 0
    return line
      .split(',')
      .filter(Boolean)
      .map((segment) => {
        const values = decodeSegment(segment)
        column += values[0]
        values[0] =
          column -
          (removed[lineIndex] || []).filter((offset) => offset < column).length
        return values
      })
  })
  return JSON.stringify({ metadata, mappings })
}

async function verify() {
  const result = await compare(reference, dist)
  const allowed = new Set()
  const affected = new Set(
    result.differences
      .map((difference) => difference.path.replace(/\.map$/, ''))
      .filter(
        (name) =>
          path.dirname(name) === path.join('compiled/next-server') &&
          /\.runtime\.(dev|prod)\.js$/.test(name)
      )
  )
  for (const name of affected) {
    const pair = [name, name + '.map']
    if (
      !result.differences.some((difference) => pair.includes(difference.path))
    )
      continue
    const [before, after] = await Promise.all([
      fs.readFile(path.join(reference, name), 'utf8'),
      fs.readFile(path.join(dist, name), 'utf8'),
    ])
    const a = canonicalCode(before)
    const b = canonicalCode(after)
    if (a.code !== b.code) continue
    const [mapA, mapB] = await Promise.all(
      pair
        .slice(1)
        .flatMap((map) => [
          fs.readFile(path.join(reference, map), 'utf8').then(JSON.parse),
          fs.readFile(path.join(dist, map), 'utf8').then(JSON.parse),
        ])
    )
    if (canonicalMap(mapA, a.removed) !== canonicalMap(mapB, b.removed))
      continue
    pair.forEach((file) => allowed.add(file))
  }
  const unexpected = result.differences.filter(
    (difference) =>
      difference.reason !== 'bytes' || !allowed.has(difference.path)
  )
  if (unexpected.length)
    throw new Error(
      `Unexpected artifact differences: ${JSON.stringify(unexpected)}`
    )
  return {
    files: result.files,
    acceptedIdDifferences: result.differences.map(
      (difference) => difference.path
    ),
  }
}

async function run(variant, label, measured) {
  if (variant === 'rust-cold')
    await fs.rm(cache, { recursive: true, force: true })
  const args = ['--filter=next', variant === 'taskr' ? 'build' : 'build:rust']
  if (variant !== 'taskr') args.push('--stats')
  const log = await fs.open(path.join(output, `${label}.log`), 'wx')
  const events = []
  let pending = ''
  let text = ''
  let writes = Promise.resolve()
  const started = performance.now()
  let elapsedMs
  try {
    const child = spawn('pnpm', args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const capture = (chunk) => {
      writes = writes.then(() => log.write(chunk))
      text += chunk.toString()
      pending += chunk.toString()
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines) {
        if (/Starting|Finished|Transforms executed/.test(line))
          events.push({ ms: performance.now() - started, line })
      }
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => {
        elapsedMs = performance.now() - started
        if (code !== 0)
          reject(
            new Error(`${label} failed (${signal || code}); see ${label}.log`)
          )
        else resolve()
      })
    })
  } finally {
    await writes
    await log.close()
  }
  const transforms = Number(text.match(/Transforms executed: (\d+)/)?.[1])
  if (variant === 'rust-cold') coldTransformCount ??= transforms
  if (
    variant !== 'taskr' &&
    (!coldTransformCount ||
      transforms !== (variant === 'rust-warm' ? 0 : coldTransformCount))
  ) {
    throw new Error(
      `${label}: unexpected transform count ${transforms}; inspect ${label}.log`
    )
  }
  const result = {
    label,
    variant,
    measured,
    elapsedMs,
    transforms: variant === 'taskr' ? null : transforms,
    events,
  }
  console.log(`${label}: ${(elapsedMs / 1000).toFixed(3)}s`)
  return result
}

async function main() {
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0)
    throw new Error('Invalid --cooldown-ms')
  await fs.access(binary)
  await fs.mkdir(output, { recursive: resume }) // Preserve reports unless explicitly resuming.
  try {
    await fs.access(backup)
    throw new Error(`Restore existing ${backup} before benchmarking`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const metadata = {
    node: process.version,
    nodeExecutable: process.execPath,
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    binarySha256: createHash('sha256')
      .update(await fs.readFile(binary))
      .digest('hex'),
    profile: 'release',
    cooldownMs,
    orders,
    runs: [],
  }
  const result = resume
    ? JSON.parse(await fs.readFile(path.join(output, 'results.json'), 'utf8'))
    : metadata
  if (
    result.binarySha256 !== metadata.binarySha256 ||
    result.node !== metadata.node ||
    (result.cooldownMs || 0) !== cooldownMs
  ) {
    throw new Error('Cannot resume with a different binary or Node version')
  }
  if (result.error) {
    result.previousErrors ||= []
    result.previousErrors.push(result.error)
    delete result.error
  }
  coldTransformCount = result.runs.find(
    (row) => row.variant === 'rust-cold'
  )?.transforms
  let savedCache = false
  try {
    await fs.rename(cache, backup)
    savedCache = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const save = () =>
    fs.writeFile(
      path.join(output, 'results.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
  try {
    if (!resume) {
      result.runs.push(await run('taskr', 'warmup-taskr', false))
      await snapshot(dist, reference)
      const prime = await run('rust-cold', 'warmup-rust', false)
      result.runs.push(prime)
      await save()
      prime.parity = await verify()
    } else {
      const pending = result.runs.at(-1)
      if (pending && !pending.parity && pending.label !== 'warmup-taskr')
        pending.parity = await verify()
      const remaining = orders.flatMap((order, block) =>
        order.filter(
          (variant) =>
            !result.runs.some((row) => row.label === `${block + 1}-${variant}`)
        )
      )
      if (remaining.find((variant) => variant !== 'taskr') === 'rust-warm') {
        const prime = await run(
          'rust-cold',
          `resume-prime-${Date.now()}`,
          false
        )
        prime.parity = await verify()
        result.runs.push(prime)
      }
    }
    await save()
    for (const [block, order] of orders.entries()) {
      for (const variant of order) {
        const label = `${block + 1}-${variant}`
        if (result.runs.some((row) => row.label === label)) continue
        const row = await run(variant, label, true)
        row.block = block + 1
        result.runs.push(row)
        await save()
        row.parity = await verify()
        await save()
        if (cooldownMs)
          await new Promise((resolve) => setTimeout(resolve, cooldownMs))
      }
    }
  } catch (error) {
    result.error = error.stack
    await save()
    throw error
  } finally {
    await fs.rm(cache, { recursive: true, force: true })
    if (savedCache) await fs.rename(backup, cache)
  }
  console.log(`Results: ${path.join(output, 'results.json')}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
module.exports = { canonicalCode, canonicalMap }
