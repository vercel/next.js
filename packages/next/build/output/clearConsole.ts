// This file is derived from Jest:
// https://github.com/facebook/jest/blob/d9d501ac342212b8a58ddb23a31518beb7b56f47/packages/jest-util/src/specialChars.ts#L18

const isWindows = process.platform === 'win32'
const isInteractive = process.stderr.isTTY

export function clearConsole() {
  if (!isInteractive) {
    return
  }

  process.stderr.write(isWindows ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H')
}
