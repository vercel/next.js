import Link from 'next/link'
import styles from './styles.module.css'

export default async function Page({
  params,
}: {
  params: Promise<{ num: string }>
}) {
  const { num } = await params
  return (
    <div>
      {new Array(100).fill(0).map((_, i) => (
        <div
          key={i}
          style={{
            height: 100,
            width: 100,
            background: 'pink',
            margin: 10,
          }}
        >
          <Link id="lower" href={`/${Number(num) - 1}`}>
            lower
          </Link>
          <div>{num}</div>
          <Link id="higher" href={`/${Number(num) + 1}`}>
            higher
          </Link>
        </div>
      ))}
      <div className={styles.square} />
    </div>
  )
}
