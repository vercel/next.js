// Shared config for the static generation benchmark fixtures. Knobs are
// driven by environment variables so the same fixture can be built with
// different scheduler settings. See ../README.md.
const env = process.env

const experimental = {
  // Pin the worker count so results are comparable across machines.
  cpus: Number(env.BENCH_WORKERS || 2),
}
if (env.BENCH_WORKER_THREADS === '1') experimental.workerThreads = true
if (env.BENCH_ADAPTIVE === '1') experimental.staticGenerationAdaptive = true
if (env.BENCH_MAX_CONCURRENCY) {
  experimental.staticGenerationMaxConcurrency = Number(
    env.BENCH_MAX_CONCURRENCY
  )
}
if (env.BENCH_MIN_PAGES_PER_WORKER) {
  experimental.staticGenerationMinPagesPerWorker = Number(
    env.BENCH_MIN_PAGES_PER_WORKER
  )
}
if (env.BENCH_CHUNK_SIZE) {
  experimental.staticGenerationChunkSize = Number(env.BENCH_CHUNK_SIZE)
}

/** @type {import('next').NextConfig} */
module.exports = {
  experimental,
  // Keep the benchmark focused on static generation.
  typescript: { ignoreBuildErrors: true },
  // The repo root is the workspace root.
  turbopack: { root: require('path').join(__dirname, '../../..') },
}
