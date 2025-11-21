import testImage from '../public/test.jpg'
import Image from 'next/image'
import styles from './styles.module.css'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p className={styles.template}>hello pages</p>
      <p id="deploymentId">{process.env.NEXT_DEPLOYMENT_ID}</p>
      <Image src={testImage} alt="test image" />
      <Link href="/pages-edge" id="edge-link">
        Edge
      </Link>

      <button
        onClick={() => {
          import('../data').then((mod) => {
            console.log('loaded data', mod)
          })
        }}
        id="dynamic-import"
      >
        click me
      </button>
    </>
  )
}
