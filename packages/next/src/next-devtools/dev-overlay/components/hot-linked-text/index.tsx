import React from 'react'
import {
  decodeMagicIdentifier,
  MAGIC_IDENTIFIER_REGEX,
} from '../../../../shared/lib/magic-identifier'

const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/i

const splitRegexp = new RegExp(`(${MAGIC_IDENTIFIER_REGEX.source}|\\s+)`)

export const HotlinkedText: React.FC<{
  text: string
  matcher?: (text: string) => boolean
}> = function HotlinkedText(props) {
  const { text, matcher } = props

  const wordsAndWhitespaces = text.split(splitRegexp)

  return (
    <>
      {wordsAndWhitespaces.map((word, index) => {
        if (linkRegex.test(word)) {
          const link = linkRegex.exec(word)!
          const href = link[0]
          // If link matcher is present but the link doesn't match, don't turn it into a link
          if (typeof matcher === 'function' && !matcher(href)) {
            return word
          }
          return (
            <React.Fragment key={`link-${index}`}>
              <a href={href} target="_blank" rel="noreferrer noopener">
                {word}
              </a>
            </React.Fragment>
          )
        }
        try {
          const decodedWord = decodeMagicIdentifier(word)
          if (decodedWord !== word) {
            return (
              <i key={`ident-${index}`}>
                {'{'}
                {decodedWord}
                {'}'}
              </i>
            )
          }
        } catch (e) {
          return (
            <i key={`ident-${index}`}>
              {'{'}
              {word} (decoding failed: {'' + e}){'}'}
            </i>
          )
        }
        return <React.Fragment key={`text-${index}`}>{word}</React.Fragment>
      })}
    </>
  )
}
