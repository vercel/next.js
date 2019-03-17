import React from 'react'
import Link from 'next/link'

const PostLink = (props) => (
  <li>
    <Link as={`/posts/${props.id}`} href={`/posts/${props.id}`}>
      <a>{props.title}</a>
    </Link>
  </li>
)

export default () => (
  <React.Fragment>
    <h1>My Blog</h1>
    <ul>
      <PostLink id='hello-nextjs' title='Hello Next.js' />
      <PostLink id='learn-nextjs' title='Learn Next.js is awesome' />
      <PostLink id='deploy-nextjs' title='Deploy apps with Zeit' />
    </ul>
  </React.Fragment>
)
