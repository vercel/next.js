import { useTransition } from 'react'

export function useRestartServer({
  invalidatePersistentCache,
}: {
  invalidatePersistentCache: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const url = invalidatePersistentCache
    ? '/__nextjs_restart_dev?invalidatePersistentCache=1'
    : '/__nextjs_restart_dev'

  let hasError = false

  const restartServerAction = () => {
    startTransition(async () => {
      const prevId = await fetch('/__nextjs_server_status')
        .then((res) => res.json())
        .then((data) => data.executionId as number)

      const restartRes = await fetch(url, {
        method: 'POST',
      })

      if (!restartRes.ok) {
        hasError = true
        return
      }

      // Poll for server restart confirmation
      let restartConfirmed = false
      for (let i = 0; i < 30; i++) {
        // Wait a bit before checking
        await new Promise((resolve) => setTimeout(resolve, 200))

        try {
          const curId = await fetch('/__nextjs_server_status')
            .then((res) => res.json())
            .then((data) => data.executionId as number)

          // If the execution ID has changed, the server has restarted successfully.
          if (curId !== prevId) {
            restartConfirmed = true
            break
          }
        } catch (error) {
          continue
        }
      }

      if (!restartConfirmed) {
        hasError = true
        return
      }
    })
  }

  return {
    restartServerAction,
    isPending,
    hasError,
  }
}
