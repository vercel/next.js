import React from 'react'

export type ImageProps = {
  src: string
}

function Image(props: React.PropsWithChildren<ImageProps>) {
  return (
    <div>
      <img src={props.src} />
    </div>
  )
}

export default Image
