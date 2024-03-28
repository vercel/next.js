import { HNRequest } from './HNRequest'

const WEBEMBED_URL = 'https://webembeds.com'

const SUPPORTED_EMBEDS = [
  'codepen.io',
  'twitter.com',
  'youtube.com',
  'youtu.be',
  'glitch.com',
  'github.com',
  'soundcloud.com',
  'anchor.fm',
  'spotify.com',
  'giphy.com',
  'gph.is',
  'codesandbox.io',
  'canva.com',
  'twitch.tv',
  'expo.io',
  'repl.it',
  'runkit.com',
  'vimeo.com',
  'loom.com',
  'hashnode.com',
  'facebook.com',
  'fb.watch',
  'instagram.com',
  'instagr.am',
  'snappify.io',
  'snappify.com',
  'stackblitz.com',
]

export const triggerEmbed = async (node?: Element | undefined) => {
  if (!node) return

  let apiURL = `${WEBEMBED_URL}/api/embed`
  const embedURL = node.getAttribute('href')

  if (!embedURL) return

  let isSupported = false

  // eslint-disable-next-line no-restricted-syntax
  for (const link of SUPPORTED_EMBEDS) {
    if (embedURL.includes(link)) {
      isSupported = true
      break
    }
  }

  try {
    const _url = new URL(apiURL)
    _url.searchParams.set('maxwidth', '800')
    _url.searchParams.set('url', encodeURIComponent(embedURL))

    if (embedURL.includes('twitch.tv')) {
      _url.searchParams.set(
        'customHost',
        encodeURIComponent(window.location.hostname)
      )
    }

    if (embedURL.includes('open.spotify.com')) {
      _url.searchParams.set('width', '300')
      _url.searchParams.set('height', '380')
    }

    if (embedURL.includes('vimeo.com')) {
      _url.searchParams.set('width', '640')
    }

    if (!isSupported) {
      _url.searchParams.set('forceFallback', '1')
    }

    apiURL = _url.toString()
  } catch (error) {
    return
  }

  const hnReq = new HNRequest(apiURL, {
    credentials: 'same-origin',
  })
  await hnReq.exec()
  const status = await hnReq.rawResponse?.status
  if (status !== 200) {
    return
  }

  let data = await hnReq.rawResponse?.json()

  if (data.data.error) {
    return
  }

  data = data.data.output

  const { parentNode } = node as HTMLElement

  if (!parentNode) return

  if (data.html.indexOf('gist.github.com') === -1) {
    const { width, thumbnail_height, html, provider_name } = data

    if (provider_name === 'Instagram') {
      const _iframe = document.createElement('iframe')
      _iframe.srcdoc = html
      _iframe.width = width

      if (thumbnail_height) {
        _iframe.height = thumbnail_height + 5
      }

      _iframe.style.overflow = 'hidden'
      _iframe.scrolling = 'no'

      // Resize on load
      _iframe.onload = (e) => {
        if (!e.target) return
        // @ts-ignore
        const { document } = e.target?.contentWindow
        if (document && document.body.scrollHeight > 0) {
          // @ts-ignore
          e.target.height = document.body.scrollHeight
        }
      }

      // @ts-ignore
      parentNode.innerHTML = ''
      parentNode.appendChild(_iframe)
      return
    }

    // @ts-ignore
    parentNode.innerHTML = html
    // eslint-disable-next-line consistent-return
    Array.from(parentNode.querySelectorAll('script')).forEach(
      async (oldScript: HTMLScriptElement) => {
        if (!oldScript) return

        const newScript = document.createElement('script')
        Array.from(oldScript.attributes).forEach((attr) =>
          newScript.setAttribute(attr.name, attr.value)
        )

        if (oldScript.innerHTML) {
          newScript.appendChild(document.createTextNode(oldScript.innerHTML))
        }

        oldScript.parentNode?.replaceChild(newScript, oldScript)
      }
    )

    if (provider_name === 'Facebook' && 'FB' in window) {
      // @ts-ignore
      // eslint-disable-next-line no-undef
      FB!.init({ version: 'v2.7', xfbml: true })
    }

    return
  }

  const gistFrame = document.createElement('iframe')
  gistFrame.setAttribute('width', '100%')
  gistFrame.setAttribute('frameBorder', '0')
  gistFrame.setAttribute('scrolling', 'no')
  gistFrame.id = `gist-${new Date().getTime()}`

  // @ts-ignore
  parentNode.innerHTML = ''
  parentNode.appendChild(gistFrame)

  // Create the iframe's document
  const gistFrameHTML = `<html><body onload="parent.adjustIframeSize('${gistFrame.id}', document.body.scrollHeight)">${data.html}</body></html>`

  // Set iframe's document with a trigger for this document to adjust the height
  // TODO
  // @ts-ignore
  let gistFrameDoc = gistFrame.document

  if (gistFrame.contentDocument) {
    gistFrameDoc = gistFrame.contentDocument
  } else if (gistFrame.contentWindow) {
    gistFrameDoc = gistFrame.contentWindow.document
  }

  if (!gistFrameDoc) {
    return
  }
  gistFrameDoc.open()
  gistFrameDoc.writeln(gistFrameHTML)
  gistFrameDoc.close()
}

export const loadIframeResizer = () => {
  return new Promise((resolve) => {
    // @ts-ignore
    if (window.iframeResizerLoaded) {
      return resolve(null)
    }
    const script = document.createElement('script')

    script.src = `/js/iframe-resizer.js`
    script.async = true
    script.defer = true

    script.onload = resolve

    const scripts = document.getElementsByTagName('script')[0]
    if (!scripts || !scripts.parentNode) {
      return
    }
    scripts.parentNode.insertBefore(script, scripts)
    // @ts-ignore
    window.iframeResizerLoaded = true
  })
}
