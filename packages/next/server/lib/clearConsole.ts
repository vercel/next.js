/**
 * Polyfill for `console.clear()` as it
 * doesn't work on some ternimals.
 */
export default function clearConsole() {
  process.stdout.write(
    process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H'
  )
}
