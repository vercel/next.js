import React from 'react'

type Props = {
  content: object
}

const PrintObject: React.FunctionComponent<Props> = ({ content }) => {
  const formattedContent: string = JSON.stringify(content, null, 2)
  return <pre>{formattedContent}</pre>
}

export default PrintObject
