import Image from 'next/image'
import { Blurhash } from "react-blurhash";
import styles from '../styles.module.css'

const Code = (p) => <code className={styles.inlineCode} {...p} />

const Index = () => (
  <div className={styles.container}>
    <div className={styles.card}>
      <h1>Image Component with Next.js</h1>
      <p>
        The images below use the{' '}
        <a href="https://nextjs.org/docs/api-reference/next/image">
          &lt;Image&gt;
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
        the <Code>domains</Code>.
      </p>
      <Image
        alt="Next.js logo"
        src="https://assets.vercel.com/image/upload/v1538361091/repositories/next-js/next-js.png"
        width={1200}
        height={400}
      />
      <hr className={styles.hr} />
      <p>
        Passing a placeholder
      </p>
      <Image
        alt="Next.js logo"
        src="https://assets.vercel.com/image/upload/v1538361091/repositories/next-js/next-js.png"
        width={1200}
        height={400}
        placeholder={<h2>Loading...</h2>}
      />
      <hr className={styles.hr} />
      <p>
        Passing Blurhash as placeholder
      </p>
      <Image
        alt="Next.js logo"
        src="https://assets.vercel.com/image/upload/v1538361091/repositories/next-js/next-js.png"
        width={1200}
        height={400}
        placeholder={
          <Blurhash
            hash="LEHLk~WB2yk8pyoJadR*.8kCIAnj"
            width={600}
            height={600}
            resolutionX={32}
            resolutionY={32}
            punch={1}
          />
        }
      />
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
