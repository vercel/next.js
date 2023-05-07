import React from 'react'
import { getWordsAndWhitespaces } from './get-words-and-whitespaces'

const linkRegex = /https?:\/\/[^\s/$.?#].[^\s"]*/i

export const HotlinkedText: React.FC<{
  text: string
}> = function HotlinkedText(props) {
  const { text } = props

  const wordsAndWhitespaces = getWordsAndWhitespaces(text)

  return (
    <>
      {linkRegex.test(text)
        ? wordsAndWhitespaces.map((word, index) => {
            if (linkRegex.test(word)) {
              return (
                <React.Fragment key={`link-${index}`}>
                  <a href={word}>{word}</a>
                </React.Fragment>
              )
            }
            return <React.Fragment key={`text-${index}`}>{word}</React.Fragment>
          })
        : text}
    </>
  )
}
