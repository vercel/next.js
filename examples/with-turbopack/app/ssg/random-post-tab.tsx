'use client'

import { Tab } from '#/ui/tab'
import clsx from 'clsx'
import React, { useEffect } from 'react'

const randomNumber = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1) + min)

export function RandomPostTab({ path }: { path: string }) {
  const [post, setPost] = React.useState<null | { text: string; slug: string }>(
    null
  )

  useEffect(() => {
    const randomId = String(randomNumber(3, 100))
    setPost({ text: `Post ${randomId} (On Demand)`, slug: randomId })
  }, [])

  return (
    <div
      className={clsx('inline-flex transition', {
        'opacity-0': !post,
        'opacity-100': post,
      })}
    >
      {post ? (
        <Tab path={path} item={{ text: post.text, slug: post.slug }} />
      ) : null}
    </div>
  )
}
