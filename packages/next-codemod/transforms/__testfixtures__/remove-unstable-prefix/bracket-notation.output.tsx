// @ts-nocheck
/* eslint-disable */
const cache = require('next/cache')
const dynamicCache = await import('next/cache')

// Bracket notation property access with string literals
const tag = cache["cacheTag"]('my-tag')
const life = dynamicCache["cacheLife"]('2 hours')

// Direct bracket notation access on require
const directTag = require('next/cache')["cacheTag"]

// Bracket notation property access inside a function
function testCache() {
  const tag2 = cache["cacheTag"]('tag2')
  const life2 = dynamicCache["cacheLife"]('life2')

  return { tag2, life2 }
}