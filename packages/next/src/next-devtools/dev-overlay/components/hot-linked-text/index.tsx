import React from 'react'
import { deobfuscateTextParts } from '../../../../shared/lib/magic-identifier'

const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/i

export const HotlinkedText: React.FC<{
  text: string
  matcher?: (text: string) => boolean
}> = function HotlinkedText(props) {
  const { text, matcher } = props

  // Deobfuscate the entire text first
  const deobfuscatedParts = deobfuscateTextParts(text)

  return (
    <>
      {deobfuscatedParts.map(([type, part], outerIndex) => {
        if (type === 'raw') {
          return (
            part
              // Split on whitespace and links
              .split(/(\s+|https?:\/\/[^\s/$.?#].[^\s)'"]*)/)
              .map((rawPart, index) => {
                if (linkRegex.test(rawPart)) {
                  const link = linkRegex.exec(rawPart)!
                  const href = link[0]
                  // If link matcher is present but the link doesn't match, don't turn it into a link
                  if (typeof matcher === 'function' && !matcher(href)) {
                    return (
                      <React.Fragment key={`link-${outerIndex}-${index}`}>
                        {rawPart}
                      </React.Fragment>
                    )
                  }
                  return (
                    <React.Fragment key={`link-${outerIndex}-${index}`}>
                      <a href={href} target="_blank" rel="noreferrer noopener">
                        {rawPart}
                      </a>
                    </React.Fragment>
                  )
                } else {
                  return (
                    <React.Fragment key={`text-${outerIndex}-${index}`}>
                      {rawPart}
                    </React.Fragment>
                  )
                }
              })
          )
        } else if (type === 'deobfuscated') {
          // italicize the deobfuscated part
          return <i key={`ident-${outerIndex}`}>{part}</i>
        } else {
          throw new Error(`Unknown text part type: ${type}`)
        }
      })}
    </>
  )
}
