import { useTransition } from 'react'

export function useRestartServer() {
  const [isPending, startTransition] = useTransition()

  /**
   * @returns A Promise that resolves to a boolean value of server restart status.
   */
  const restartServerAction = ({
    invalidatePersistentCache,
  }: {
    invalidatePersistentCache: boolean
  }): Promise<boolean> => {
    const url = invalidatePersistentCache
      ? '/__nextjs_restart_dev?invalidatePersistentCache=1'
      : '/__nextjs_restart_dev'

    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const curId = await fetch('/__nextjs_server_status')
            .then((res) => res.json())
            .then((data) => data.executionId as number)

          const restartRes = await fetch(url, {
            method: 'POST',
          })

          if (!restartRes.ok) {
            resolve(false)
            return
          }

          // Poll for server restart confirmation.
          for (let i = 0; i < 10; i++) {
            await new Promise((resolveTimeout) =>
              setTimeout(resolveTimeout, 200)
            )

            try {
              const nextId = await fetch('/__nextjs_server_status')
                .then((res) => res.json())
                .then((data) => data.executionId as number)

              // If the execution ID has changed, the server has restarted successfully.
              if (curId !== nextId) {
                resolve(true)
                return
              }
            } catch (e) {
              continue
            }
          }

          // If we've exhausted all polling attempts, consider it failed
          resolve(false)
        } catch (error) {
          resolve(false)
        }
      })
    })
  }

  return {
    restartServerAction,
    isPending,
  }
}
