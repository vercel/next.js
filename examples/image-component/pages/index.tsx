import styles from '../styles.module.css'
import Image from 'next/image'
import Link from 'next/link'
import ViewSource from '../components/view-source'
import vercel from '../public/vercel.png'

type CodeProps = {
  children: React.ReactNode
}

const Code = ({ children }: CodeProps) => (
  <code className={styles.inlineCode}>{children}</code>
)

export default function Index() {
  return (
    <div className={styles.container}>
      <ViewSource pathname="pages/index.tsx" />
      <div className={styles.card}>
        <h1>Image Component with Next.js</h1>
        <p>
          This page demonstrates the usage of the{' '}
          <Link href="https://nextjs.org/docs/api-reference/next/image">
            <>next/image </>
          </Link>
          component with live examples.
        </p>
        <p>
          This component is designed to{' '}
          <Link href="https://nextjs.org/docs/basic-features/image-optimization">
            <>automatically optimize </>
          </Link>
          images on-demand as the browser requests them.
        </p>
        <hr className={styles.hr} />
        <h2 id="layout">Layout</h2>
        <p>
          The <Code>layout</Code> property tells the image to respond
          differently depending on the device size or the container size.
        </p>
        <p>
          Select a layout below and try resizing the window or rotating your
          device to see how the image reacts.
        </p>
        <ul>
          <li>
            <Link href="/layout-intrinsic">layout="intrinsic"</Link>
          </li>
          <li>
            <Link href="/layout-responsive">layout="responsive"</Link>
          </li>
          <li>
            <Link href="/layout-fixed">layout="fixed"</Link>
          </li>
          <li>
            <Link href="/layout-fill">layout="fill"</Link>
          </li>
          <li>
            <Link href="/background">background demo</Link>
          </li>
        </ul>
        <hr className={styles.hr} />
        <h2 id="placeholder">Placeholder</h2>
        <p>
          The <Code>placeholder</Code> property tells the image what to do while
          loading.
        </p>
        <p>
          You can optionally enable a blur-up placeholder while the high
          resolution image loads.
        </p>
        <p>
          Try it out below (you may need to disable cache in dev tools to see
          the effect if you already visited):
        </p>
        <ul>
          <li>
            <Link href="/placeholder">placeholder="blur"</Link>
          </li>
          <li>
            <Link href="/shimmer">
              placeholder="blur" with animated shimmer blurDataURL
            </Link>
          </li>
          <li>
            <Link href="/color">
              placeholder="blur" with solid color blurDataURL
            </Link>
          </li>
        </ul>
        <hr className={styles.hr} />
        <h2 id="internal">Internal Image</h2>
        <p>
          The following is an example of a reference to an internal image from
          the <Code>public</Code> directory.
        </p>
        <p>
          This image is intentionally large so you have to scroll down to the
          next image.
        </p>
        <Image alt="Vercel logo" src={vercel} width={1000} height={1000} />
        <hr className={styles.hr} />
        <h2 id="external">External Image</h2>
        <p>
          The following is an example of a reference to an external image at{' '}
          <Code>assets.vercel.com</Code>.
        </p>
        <p>
          External domains must be configured in <Code>next.config.js</Code>{' '}
          using the <Code>domains</Code> property.
        </p>
        <Image
          alt="Next.js logo"
          src="https://assets.vercel.com/image/upload/v1538361091/repositories/next-js/next-js-bg.png"
          width={1200}
          height={400}
        />
        <hr className={styles.hr} />
        <h2 id="more">Learn More</h2>
        <p>
          You can optionally configure a cloud provider, device sizes, and more!
        </p>
        <p>
          Checkout the{' '}
          <Link href="https://nextjs.org/docs/basic-features/image-optimization">
            Image Optimization documentation
          </Link>{' '}
          to learn more.
        </p>
      </div>
    </div>
  )
}
