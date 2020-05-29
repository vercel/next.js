import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function usePreviewRedirect() {
  const router = useRouter()
  const { query, asPath } = router
  const { agilityPreviewKey, contentid } = query

  useEffect(() => {
    // kickout if we don't have an agilityPreviewKey
    if (!agilityPreviewKey) return

    // redirect to our preview API route
    let redirectLink = `/api/preview?slug=${asPath}&agilitypreviewkey=${agilityPreviewKey}`

    // Check if we have a `contentid` in the query, if so this is a preview request for a Dynamic Page Item
    if (contentid) redirectLink = `${redirectLink}&contentid=${contentid}`

    window.location.href = redirectLink
  }, [asPath, agilityPreviewKey, contentid])
}
