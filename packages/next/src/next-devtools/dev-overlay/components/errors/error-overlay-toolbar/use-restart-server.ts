import { useState } from 'react'

export function useRestartServer() {
  const [isPending, setIsPending] = useState(false)

  const restartServer = async ({
    invalidateFileSystemCache,
  }: {
    invalidateFileSystemCache: boolean
  }): Promise<void> => {
    setIsPending(true)

    const url = invalidateFileSystemCache
      ? '/__nextjs_restart_dev?invalidateFileSystemCache=1'
      : '/__nextjs_restart_dev'

    let serverRestarted = false

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

      if (!curId) {
        console.log(
          '[Next.js DevTools] Failed to get the current server execution ID while restarting dev server.'
        )
        return
      }

      const restartRes = await fetch(url, {
        method: 'POST',
      })

      if (!restartRes.ok) {
        // Use console log to avoid spamming the error overlay which users can't control.
        console.log(
          '[Next.js DevTools] Failed to fetch restart server endpoint. Status:',
          restartRes.status
        )
        return
      }

      // Poll for server restart confirmation.
      for (let i = 0; i < 10; i++) {
        // generous 1 second delay for large apps.
        await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000))

        try {
          const nextId = await fetch('/__nextjs_server_status')
            .then((res) => res.json())
            .then((data) => data.executionId as number)

          // If the execution ID has changed, the server has restarted successfully.
          if (curId !== nextId) {
            serverRestarted = true
            // Reload the page to ensure the connection to the new server.
            window.location.reload()
            return
          }
        } catch (e) {
          continue
        }
      }

      console.log(
        '[Next.js DevTools] Failed to restart server. Exhausted all polling attempts.'
      )
      return
    } catch (error) {
      console.log('[Next.js DevTools] Failed to restart server.', error)
      return
    } finally {
      // If server restarted, don't reset isPending since the page will reload.
      if (!serverRestarted) {
        setIsPending(false)
      }
    }
  }

  return {
    restartServer,
    isPending,
  }
}
