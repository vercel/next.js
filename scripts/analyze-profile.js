#!/usr/bin/env node
/**
 * Analyze a CPU profile to identify hot modules
 */

const fs = require('fs')

const profilePath = process.argv[2]
if (!profilePath) {
  console.error('Usage: node analyze-profile.js <profile.cpuprofile>')
  process.exit(1)
}

const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'))

// Extract nodes with their hit counts
const nodes = profile.nodes || []

// Group by file/module
const moduleHits = {}
nodes.forEach((node) => {
  const fn = node.callFrame
  if (fn && fn.url) {
    const url = fn.url
    // Extract module name from path
    let moduleName = url
    if (url.includes('next/dist/')) {
      moduleName = url.split('next/dist/')[1]
    } else if (url.includes('node_modules/')) {
      moduleName = 'node_modules/' + url.split('node_modules/').pop()
    }
    if (!moduleHits[moduleName]) {
      moduleHits[moduleName] = { hits: 0 }
    }
    moduleHits[moduleName].hits += node.hitCount || 0
  }
})

// Sort by hits
const sorted = Object.entries(moduleHits)
  .filter(([_, v]) => v.hits > 0)
  .sort((a, b) => b[1].hits - a[1].hits)
  .slice(0, 40)

console.log('Top 40 modules by CPU time:')
console.log('='.repeat(70))
sorted.forEach(([name, data], i) => {
  console.log(`${String(i + 1).padStart(2)}. ${name} (${data.hits} hits)`)
})
