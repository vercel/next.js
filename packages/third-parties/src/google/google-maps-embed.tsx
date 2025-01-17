import { GoogleMapsEmbed as TPCGoogleMapEmbed } from 'third-party-capital'

import ThirdPartyScriptEmbed from '../ThirdPartyScriptEmbed'
import type { GoogleMapsEmbed as GoogleMapsEmbedTypes } from '../types/google'

export default function GoogleMapsEmbed(props: GoogleMapsEmbedTypes) {
  const { apiKey, ...restProps } = props
  const formattedProps = { ...restProps, key: apiKey }
  const { html } = TPCGoogleMapEmbed(formattedProps)

  return (
    <ThirdPartyScriptEmbed
      height={formattedProps.height || null}
      width={formattedProps.width || null}
      html={html}
      dataNtpc="GoogleMapsEmbed"
    ></ThirdPartyScriptEmbed>
  )
}
