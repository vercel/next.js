import React, { Fragment } from 'react'
import PostListItem from './post-list-item'
import baseTheme from '../../base.module.css'
import theme from './post-list.module.css'

const PostList = props => {
  const { posts } = props

  const postListItems = posts.map(post => (
    <PostListItem key={post.title} {...post} />
  ))
  return (
    <Fragment>
      <div className={theme.postList}>
        <div className={baseTheme.container}>
          <ul>{postListItems}</ul>
        </div>
      </div>
    </Fragment>
  )
}

export default PostList
