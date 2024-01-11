import React from 'react'
import { getWordsAndWhitespaces } from './get-words-and-whitespaces'

const linkRegex = /https?:\/\/[^\s/$.?#].[^\s)'"]*/i

export function HotlinkedText(props: { text: string }): React.ReactNode {
  const { text } = props

  const wordsAndWhitespaces = getWordsAndWhitespaces(text)

  return (
    <>
      {linkRegex.test(text)
        ? wordsAndWhitespaces.map((word, index) => {
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
            return <React.Fragment key={`text-${index}`}>{word}</React.Fragment>
          })
        : text}
    </>
  )
}
