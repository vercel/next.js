import { useEffect } from 'react'
import { triggerEmbed } from '../services/embed'

export const useEmbeds = ({ enabled }: { enabled: boolean }) => {
  useEffect(() => {
    // if enabled we need to trigger all embeds on page load
    if (enabled) {
      ;(async () => {
        document.querySelectorAll('a.embed-card').forEach((node) => {
          triggerEmbed(node)
        })
      })()
    }
  }, [enabled])
}
