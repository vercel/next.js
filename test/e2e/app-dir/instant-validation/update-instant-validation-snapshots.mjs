#!/usr/bin/env node
// @ts-check
import execa from 'execa'

const inputArgs = process.argv.slice(2)

if (!inputArgs.some((arg) => arg === '-u' || arg === '--updateSnapshot')) {
  inputArgs.push('-u')
}

const startArgs = [...inputArgs]

// For dev, we need to pass `-t 'initial load'` to avoid problems with multiple snapshots
// Extract any `-t` args passed and prefix them
/** @type {string[]} */
const devArgs = []

/** @type {string | null} */
let testPattern = null

let i = 0
while (i < inputArgs.length) {
  if (inputArgs[i] === '-t' || inputArgs[i] === '--testNamePattern') {
    testPattern = inputArgs[i + 1]
    i += 2
  } else {
    devArgs.push(inputArgs[i])
    i++
  }
}

if (testPattern !== null && !testPattern.startsWith('initial load')) {
  devArgs.push(`-t`, `initial load.*(${testPattern})`)
} else {
  devArgs.push(`-t`, `initial load`)
}

await execa(`pnpm`, [`test-dev-turbo`, ...devArgs], {
  stdio: 'inherit',
  reject: false,
})
await execa(`pnpm`, [`test-start-turbo`, ...startArgs], {
  stdio: 'inherit',
  reject: false,
})
