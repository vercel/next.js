import { NextTweet } from 'next-tweet'
import { Caption } from './caption'
import type { ReactNode } from 'react'

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
        {/* @ts-ignore */}
        <NextTweet id={id} />
      </div>
      {caption && <Caption>{caption}</Caption>}
    </div>
  )
}
