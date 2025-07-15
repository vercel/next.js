import { useState } from 'react'

export function useRestartServer() {
  const [isPending, setIsPending] = useState(false)

  /**
   * @returns A Promise that resolves to a boolean value of server restart status.
   */
  const restartServerAction = async ({
    invalidatePersistentCache,
  }: {
    invalidatePersistentCache: boolean
  }): Promise<boolean> => {
    setIsPending(true)

    const url = invalidatePersistentCache
      ? '/__nextjs_restart_dev?invalidatePersistentCache=1'
      : '/__nextjs_restart_dev'

    try {
      const curId = await fetch('/__nextjs_server_status')
        .then((res) => res.json())
        .then((data) => data.executionId as number)
        .catch((error) => {
          console.log(
            '[Next.js DevTools] Failed to fetch server status while restarting dev server.',
            error
          )
          return null
        })

      const restartRes = await fetch(url, {
        method: 'POST',
      })

      if (!restartRes.ok) {
        // Use console log to avoid spamming the error overlay which users can't control.
        console.log(
          '[Next.js DevTools] Failed to fetch restart server endpoint. Status:',
          restartRes.status
        )
        return false
      }

      // Poll for server restart confirmation.
      for (let i = 0; i < 10; i++) {
        await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 200))

        try {
          const nextId = await fetch('/__nextjs_server_status')
            .then((res) => res.json())
            .then((data) => data.executionId as number)

          // If the execution ID has changed, the server has restarted successfully.
          if (curId !== nextId) {
            return true
          }
        } catch (e) {
          continue
        }
      }

      console.log(
        '[Next.js DevTools] Failed to restart server. Exhausted all polling attempts.'
      )
      return false
    } catch (error) {
      console.log('[Next.js DevTools] Failed to restart server.', error)
      return false
    } finally {
      setIsPending(false)
    }
  }

  return {
    restartServerAction,
    isPending,
  }
}
