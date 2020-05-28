// import { useEffect } from 'react'
import { getParameterByName } from './utils'

export default function usePreviewRedirect() {
  if (!process.browser) {
    //kickout if this is not being executed in the browser
    return
  }

  //check if we have an `agilitypreviewkey` in the query of this request
  const agilityPreviewKey = getParameterByName(`agilitypreviewkey`)

  if (!agilityPreviewKey) {
    //kickout if we don't have a preview key
    return
  }

  //redirect this to our preview API route
  const previewAPIRoute = `/api/preview`
  const slug = window.location.pathname

  //check if we have a `contentid` in the query, if so this is a preview request for a Dynamic Page Item
  const contentID = getParameterByName(`contentid`)

  //do the redirect
  let redirectLink = `${previewAPIRoute}?slug=${slug}&agilitypreviewkey=${agilityPreviewKey}`

  //add-in the contentid if we have it
  if (contentID) {
    redirectLink = `${redirectLink}&contentid=${contentID}`
  }

  window.location.href = redirectLink

  return
}
