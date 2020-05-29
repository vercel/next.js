import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function usePreviewRedirect() {
  const router = useRouter()
  const { query, asPath } = router
  const { agilitypreviewkey, contentid } = query

  useEffect(() => {
    // kickout if we don't have an agilityPreviewKey
    if (!agilitypreviewkey) return

    // redirect to our preview API route
    let redirectLink = `/api/preview?slug=${asPath}&agilitypreviewkey=${agilitypreviewkey}`

    // Check if we have a `contentid` in the query, if so this is a preview request for a Dynamic Page Item
    if (contentid) redirectLink = `${redirectLink}&contentid=${contentid}`

    window.location.href = redirectLink
  }, [asPath, agilitypreviewkey, contentid])
}
