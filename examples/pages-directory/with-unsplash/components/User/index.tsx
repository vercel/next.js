import useSWR from 'swr'
import fetcher from 'libs/fetcher'
import Link from 'next/link'
import styles from './User.module.css'
import Social from 'components/Social'

const User = () => {
  const { data, error } = useSWR('/api/user', fetcher)

  if (error) return <div>failed to load</div>

  return (
    <header className={styles.header}>
      <Link href="/">
        {data && (
          <img
            src={data.profile_image.large}
            className={`${styles.headerImage} ${styles.borderCircle}`}
            alt={data.name}
          />
        )}
      </Link>
      <h2 className={styles.headingLg}>
        <Link href="/">{data ? data.name : ''}</Link>
      </h2>

      {data ? <Social user={data} /> : ''}

      <p>{data ? data.bio : ''}</p>
    </header>
  )
}

export default User
