import PostListItem from './post-list-item'
import baseTheme from '../../base.module.css'
import theme from './post-list.module.css'

export default function PostList({ posts }) {
  return (
    <div className={theme.postList}>
      <div className={baseTheme.container}>
        <ul>
          {posts.map(post => (
            <PostListItem key={post.title} {...post} />
          ))}
        </ul>
      </div>
    </div>
  )
}
