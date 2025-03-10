/*
MIT License

Copyright (c) 2015 - present Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

// This file is based on https://github.com/microsoft/vscode/blob/f860fcf11022f10a992440fd54c6e45674e39617/src/vs/base/node/pfs.ts
// See the LICENSE at the top of the file

import { rename as fsRename, stat } from 'node:fs/promises'

/**
 * A drop-in replacement for `fs.rename` that:
 * - allows to move across multiple disks
 * - attempts to retry the operation for certain error codes on Windows
 */
export async function rename(
  source: string,
  target: string,
  windowsRetryTimeout: number | false = 60000 /* matches graceful-fs */
): Promise<void> {
  if (source === target) {
    return // simulate node.js behaviour here and do a no-op if paths match
  }

  if (process.platform === 'win32' && typeof windowsRetryTimeout === 'number') {
    // On Windows, a rename can fail when either source or target
    // is locked by AV software. We do leverage graceful-fs to iron
    // out these issues, however in case the target file exists,
    // graceful-fs will immediately return without retry for fs.rename().
    await renameWithRetry(source, target, Date.now(), windowsRetryTimeout)
  } else {
    await fsRename(source, target)
  }
}

async function renameWithRetry(
  source: string,
  target: string,
  startTime: number,
  retryTimeout: number,
  attempt = 0
): Promise<void> {
  try {
    return await fsRename(source, target)
  } catch (error: any) {
    if (
      error.code !== 'EACCES' &&
      error.code !== 'EPERM' &&
      error.code !== 'EBUSY'
    ) {
      throw error // only for errors we think are temporary
    }

    if (Date.now() - startTime >= retryTimeout) {
      console.error(
        `[node.js fs] rename failed after ${attempt} retries with error: ${error}`
      )

      throw error // give up after configurable timeout
    }

    if (attempt === 0) {
      let abortRetry = false
      try {
        const statTarget = await stat(target)
        if (!statTarget.isFile()) {
          abortRetry = true // if target is not a file, EPERM error may be raised and we should not attempt to retry
        }
      } catch (e) {
        // Ignore
      }

      if (abortRetry) {
        throw error
      }
    }

    // Delay with incremental backoff up to 100ms
    await timeout(Math.min(100, attempt * 10))

    // Attempt again
    return renameWithRetry(source, target, startTime, retryTimeout, attempt + 1)
  }
}

const timeout = (millis: number) =>
  new Promise((resolve) => setTimeout(resolve, millis))
