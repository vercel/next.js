import styles from '../styles.module.css'

const Code = (p) => <code className={styles.inlineCode} {...p} />

const Index = () => (
  <div className={styles.container}>
    <div className={styles.card}>
      <h1>Headers with Next.js</h1>
      <hr className={styles.hr} />
      <p>
        The links below are examples of{' '}
        <a href="https://nextjs.org/docs/api-reference/next.config.js/headers">
          custom <Code>headers</Code>
        </a>{' '}
        added to your Next.js app.
      </p>
      <nav>
        <ul className={styles.list}>
          <li>
            <a href="/about">
              <a>Visit /about (it contains a X-About-Custom-Header)</a>
            </a>
          </li>
          <li>
            <a href="/news/123">
              <a>Visit /news/123 (it contains a X-News-Custom-Header)</a>
            </a>
          </li>
        </ul>
      </nav>
      <p>
        Open <Code>next.config.js</Code> to learn more about the headers that
        match the links above.
      </p>
      <hr className={styles.hr} />
    </div>
  </div>
)

export default Index
