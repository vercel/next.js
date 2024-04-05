import React from 'react'
import {
  decodeMagicIdentifier,
  MAGIC_IDENTIFIER_REGEX,
} from '../../../../../../shared/lib/magic-identifier'

const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/i

const splitRegexp = new RegExp(`(${MAGIC_IDENTIFIER_REGEX.source}|\\s+)`)

export const HotlinkedText: React.FC<{
  text: string
}> = function HotlinkedText(props) {
  const { text } = props

  const wordsAndWhitespaces = text.split(splitRegexp)

  return (
    <>
      {wordsAndWhitespaces.map((word, index) => {
        if (linkRegex.test(word)) {
          const link = linkRegex.exec(word)!
          return (
            <React.Fragment key={`link-${index}`}>
              <a href={link[0]} target="_blank" rel="noreferrer noopener">
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
