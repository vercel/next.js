/** @type {import('next').NextConfig} */
module.exports = {
  cacheMaxMemorySize: process.env.CACHE_MAX_MEMORY_SIZE
    ? Number(process.env.CACHE_MAX_MEMORY_SIZE)
    : undefined,
}
