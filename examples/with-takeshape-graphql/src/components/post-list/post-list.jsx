import PostListItem from './post-list-item'
import baseTheme from '../../base.module.css'
import theme from './post-list.module.css'

const PostList = ({ posts }) => {
  const postListItems = posts.map(post => (
    <PostListItem key={post.title} {...post} />
  ))

  return (
    <div className={theme.postList}>
      <div className={baseTheme.container}>
        <ul>{postListItems}</ul>
      </div>
    </div>
  )
}

export default PostList
