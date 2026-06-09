// This module tests that user-defined async functions inside a module
// with top-level await are preserved correctly when the wrapper uses
// function*/yield (they should already be downleveled by SWC).
const data = await fetch('/api/data')

export async function processData() {
  const result = await data.json()
  return result
}

export const value = await Promise.resolve(42)
