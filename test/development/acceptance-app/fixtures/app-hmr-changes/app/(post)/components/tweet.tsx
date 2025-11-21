import type { ReactNode } from 'react'
import { Tweet as ReactTweet, TweetComponents } from 'react-tweet'
import Image from 'next/image'

import { Caption } from './caption'

const components: TweetComponents = {
  AvatarImg: (props) => <Image {...props} />,
  MediaImg: (props) => <Image {...props} fill unoptimized />,
}

// we import this globally in the top-most layout.tsx file
// until Next.js lands suspense-y CSS support
// import "./tweet.css";

interface TweetArgs {
  id: string
  caption: ReactNode
}

export async function Tweet({ id, caption }: TweetArgs) {
  return (
    <div className="my-6">
      <div className="flex justify-center">
        <ReactTweet id={id} components={components} />
      </div>
      {caption && <Caption>{caption}</Caption>}
    </div>
  )
}
