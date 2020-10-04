import Link from 'next/link'
import styles from './styles.module.css'

export const data = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export default function PostCardGrid() {
  return (
    <div className={styles.postCardGridWrapper}>
      <h2>With QueryString Routing, and a reload won't use the modal</h2>
      <div className={styles.postCardGrid}>
        {data.map((id, index) => (
          <Link key={index} href={`/?postId=${id}`} as={`/post/${id}`}>
            <a className={styles.postCard}>{id}</a>
          </Link>
        ))}
      </div>

      <h2>With Dynamic Routing, and reloads will keep the modal</h2>
      <div className={styles.postCardGrid}>
        {data.map((id, index) => (
          <Link key={index} href="/article/[articleId]" as={`/article/${id}`}>
            <a className={styles.postCard}>{id}</a>
          </Link>
        ))}
      </div>
    </div>
  )
}
