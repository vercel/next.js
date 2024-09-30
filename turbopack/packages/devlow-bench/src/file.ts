import { watch } from 'fs'
import { access, constants } from 'fs/promises'
import { dirname } from 'path'

export async function waitForFile(
  path: string,
  timeout: number
): Promise<void> {
  let currentAction = ''
  let timeoutRef
  const timeoutPromise = new Promise<void>((resolve, reject) => {
    timeoutRef = setTimeout(() => {
      reject(
        new Error(`Timed out waiting for file ${path} (${currentAction}))`)
      )
    }, timeout || 60000)
  })
  const elements: string[] = []
  let current = path
  while (true) {
    elements.push(current)
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  elements.reverse()
  try {
    for (const path of elements) {
      const checkAccess = () =>
        access(path, constants.F_OK)
          .then(() => true)
          .catch(() => false)
      if (!(await checkAccess())) {
        let resolveCheckAgain = () => {}
        const watcher = watch(dirname(path), () => {
          resolveCheckAgain()
        })
        currentAction = `waiting for ${path}`
        let checkAgainPromise = new Promise<void>((resolve) => {
          resolveCheckAgain = resolve
        })
        try {
          do {
            await Promise.race([timeoutPromise, checkAgainPromise])
            // eslint-disable-next-line no-loop-func
            checkAgainPromise = new Promise<void>((resolve) => {
              resolveCheckAgain = resolve
            })
          } while (!(await checkAccess()))
        } finally {
          watcher.close()
        }
      }
    }
  } finally {
    clearTimeout(timeoutRef)
  }
}
