import { memo } from 'react'

import { useEmbeds } from '../utils/renderer/hooks/useEmbeds'
import { markdownToHtml } from '../utils/renderer/markdownToHtml'

type Props = {
  contentMarkdown: string
}

const _MarkdownToHtml = ({ contentMarkdown }: Props) => {
  const content = markdownToHtml(contentMarkdown)
  useEmbeds({ enabled: true })

  return (
    <div
      className="hashnode-content-style mx-auto w-full px-5 md:max-w-screen-md"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

export const MarkdownToHtml = memo(_MarkdownToHtml)
