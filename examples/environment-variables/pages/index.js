import styles from '../styles.module.css'

// The value here will be defined in the terminal, because of server side rendering,
// but not in the browser console
console.log('[Server only] ENV_VARIABLE:', process.env.ENV_VARIABLE)
console.log('[Server only] ENV_LOCAL_VARIABLE:', process.env.ENV_LOCAL_VARIABLE)

const Code = (p) => <code className={styles.inlineCode} {...p} />

const IndexPage = () => (
  <div className={styles.container}>
    <div className={styles.card}>
      <h1>Environment Variables with Next.js</h1>
      <hr className={styles.hr} />
      <p>
        In the table below you'll see how{' '}
        <a href="https://nextjs.org/docs/basic-features/environment-variables#exposing-environment-variables-to-the-browser">
          environment variables can be exposed to the browser
        </a>{' '}
        with Next.js.
      </p>
      <p>
        In general only <Code>.env.local</Code> or <Code>.env</Code> are needed
        for this, but the table also features the usage of{' '}
        <Code>.env.develoment</Code> and <Code>.env.production</Code>.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Variable Name</th>
            <th>Value</th>
            <th>Added By</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>NEXT_PUBLIC_ENV_VARIABLE</td>
            <td>{process.env.NEXT_PUBLIC_ENV_VARIABLE}</td>
            <td>
              <Code>.env</Code>
            </td>
          </tr>
          <tr>
            <td>NEXT_PUBLIC_ENV_LOCAL_VARIABLE</td>
            <td>{process.env.NEXT_PUBLIC_ENV_LOCAL_VARIABLE}</td>
            <td>
              <Code>.env.local</Code>
            </td>
          </tr>
          <tr>
            <td>NEXT_PUBLIC_DEVELOPMENT_ENV_VARIABLE</td>

            <td>{process.env.NEXT_PUBLIC_DEVELOPMENT_ENV_VARIABLE}</td>
            <td>
              <Code>.env.develoment</Code>
            </td>
          </tr>
          <tr>
            <td>NEXT_PUBLIC_PRODUCTION_ENV_VARIABLE</td>

            <td>{process.env.NEXT_PUBLIC_PRODUCTION_ENV_VARIABLE}</td>
            <td>
              <Code>.env.production</Code>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        <Code>.env.local</Code> is not added by the example, because it must be
        ignored by git, but you can add it manually:
      </p>
      <pre>
        <code>cp .env.local.example .env.local</code>
      </pre>
      <p>
        Variables in <Code>.env.production</Code> won't be available if the app
        is running in development:
      </p>
      <pre>
        <code>npm run dev</code>
      </pre>
      <p>
        Similarly, variables in <Code>.env.develoment</Code> won't be available
        if the app is running on production:
      </p>
      <pre>
        <code>npm run build && npm run start</code>
      </pre>
    </div>
  </div>
)

export default IndexPage
