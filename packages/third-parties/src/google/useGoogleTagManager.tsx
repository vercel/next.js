import { useState, useEffect, useCallback } from 'react'
import { loadScript } from 'next/script'

type GTMParams = {
  id: string
  events: string
  dataLayer: string[]
  dataLayerName: string
  auth: string
  preview: string
}

export default function useGoogleTagManager() {
  const [initParams, setInitParams] = useState()
  const init = useCallback(
    (params: GTMParams) => {
      if (initParams === undefined) {
        setInitParams(params)
      }
    },
    [initParams]
  )

  useEffect(() => {
    if (initParams !== undefined) {
      const {
        id,
        dataLayerName = 'dataLayer',
        auth,
        preview,
        dataLayer,
      } = initParams

      const gtmLayer =
        dataLayerName !== 'dataLayer' ? `$l=${dataLayerName}` : ''
      const gtmAuth = auth ? `&gtm_auth=${auth}` : ''
      const gtmPreview = preview
        ? `&gtm_preview=${preview}&gtm_cookies_win=x`
        : ''

      loadScript({
        dangerouslySetInnerHTML: {
          __html: `
        (function(w,l){
          w[l]=w[l]||[];
          w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
          ${dataLayer ? `w[l].push(${JSON.stringify(dataLayer)})` : ''}
        })(window,'${dataLayerName}');`,
        },
      })
      loadScript({
        src: `https://www.googletagmanager.com/gtm.js?id=${id}${gtmLayer}${gtmAuth}${gtmPreview}`,
      })
    }
  }, [initParams])

  return { init }
}
