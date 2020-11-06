import styles from '../styles.module.css'
import Image from 'next/image'
import Link from 'next/link'

const Code = (p) => <code className={styles.inlineCode} {...p} />

const Index = () => (
  <div className={styles.container}>
    <div className={styles.card}>
      <h1>Image Component with Next.js</h1>
      <p>
        The images below use the{' '}
        <a href="https://nextjs.org/docs/api-reference/next/image">
          next/image
        </a>{' '}
        component to ensure optimal format and size for this browser.
      </p>
      <p>
        Images are also lazy loaded by default which means they don't load until
        scrolled into view.
      </p>
      <p>Try scolling down to try it out!</p>
      <hr className={styles.hr} />
      <p>
        The following is an example of a reference to an interal image from the{' '}
        <Code>public</Code> directory.
      </p>
      <p>
        Notice that the image is responsive. As you adjust your browser width, a
        different sized image is loaded.
      </p>
      <Image alt="Vercel logo" src="/vercel.png" width={1000} height={1000} />
      <hr className={styles.hr} />
      <p>
        The following is an example of a reference to an external image at{' '}
        <Code>assets.vercel.com</Code>.
      </p>
      <p>
        External domains must be configured in <Code>next.config.js</Code> using
        the <Code>domains</Code> property.
      </p>
      <Image
        alt="Next.js logo"
        src="https://assets.vercel.com/image/upload/v1538361091/repositories/next-js/next-js-bg.png"
        width={1200}
        height={400}
      />
      <hr className={styles.hr} />
      <h2>Layouts</h2>
      <p>
        The following pages demonstrate possible <Code>layout</Code> property
        values.
      </p>
      <p>
        Click on one to try it out with your current device and be sure to
        change the window size or rotate your device to see how the image
        reacts.
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
      Checkout the documentation for{' '}
      <a href="https://nextjs.org/docs/basic-features/image-optimization">
        Image Optimization
      </a>{' '}
      to learn more.
    </div>
  </div>
)

export default Index
