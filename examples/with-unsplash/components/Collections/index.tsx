import useSWR from 'swr'
import fetcher from 'libs/fetcher'
import Link from 'next/link'
import styles from './Collections.module.css'

interface CollectionProps {
  id_collection?: number
}

const Collections = ({ id_collection }: CollectionProps) => {
  const { data, error } = useSWR(
    '/api/collection' + (id_collection ? `/${id_collection}` : ''),
    fetcher
  )

  if (error) return <div>failed to load</div>

  if (!data) return <div>loading...</div>

  return (
    <div className={styles.chips}>
      {data.map(({ id, title, slug }) =>
        id_collection ? (
          <Link href="/" key={`collection_${slug}`}>
            <a className={styles.chip}>
              {title}

              <Link href="/">
                <button
                  type="button"
                  className={styles.chip_remove}
                  aria-label="Return to home"
                ></button>
              </Link>
            </a>
          </Link>
        ) : (
          <Link
            href={{ pathname: '/collection/[slug]', query: { id: id } }}
            as={`/collection/${slug}?id=${id}`}
            key={`collection_${slug}`}
          >
            <a className={styles.chip}>{title}</a>
          </Link>
        )
      )}
    </div>
  )
}

export default Collections
