import React from 'react'
import { deobfuscateText } from '../../../../shared/lib/magic-identifier'

const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/i

export const HotlinkedText: React.FC<{
  text: string
  matcher?: (text: string) => boolean
}> = function HotlinkedText(props) {
  const { text, matcher } = props

  // Deobfuscate the entire text first
  const deobfuscated = deobfuscateText(text)

  // Split on whitespace and links
  const parts = deobfuscated.split(/(\s+|https?:\/\/[^\s/$.?#].[^\s)'"]*)/)

  return (
    <>
      {parts.map((part, index) => {
        if (linkRegex.test(part)) {
          const link = linkRegex.exec(part)!
          const href = link[0]
          // If link matcher is present but the link doesn't match, don't turn it into a link
          if (typeof matcher === 'function' && !matcher(href)) {
            return part
          }
          return (
            <React.Fragment key={`link-${index}`}>
              <a href={href} target="_blank" rel="noreferrer noopener">
                {part}
              </a>
            </React.Fragment>
          )
        }
        return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>
      })}
    </>
  )
}
