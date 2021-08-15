import sx from '@adeira/sx'
import { LayoutBlock, Link, Text, Note } from '@adeira/sx-design'
import Head from 'next/head'

export default function Home() {
  return (
    <div className={styles('container')}>
      <Head>
        <title>SX Design Example</title>
        <meta name="description" content="SX Design Example" />
      </Head>

      <main className={styles('main')}>
        <LayoutBlock spacing="large">
          <Text size={48}>
            Welcome to{' '}
            <Link href="https://github.com/adeira/sx-design" target="_blank">
              SX Design
            </Link>{' '}
            example!
          </Text>

          <Note tint="warning">
            Try to change to light/dark mode in your computer settings. SX
            Design will automatically adapt!
          </Note>

          <Text size={24} weight={200}>
            Get started by editing{' '}
            <code className={styles('code')}>
              examples/with-sx-design/pages/index.js
            </code>
          </Text>
        </LayoutBlock>
      </main>
    </div>
  )
}

const styles = sx.create({
  container: {
    minHeight: '100vh',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'rgba(var(--sx-foreground))',
    backgroundColor: 'rgba(var(--sx-background))',
  },
  main: {
    textAlign: 'center',
  },
  code: {
    background: 'rgba(var(--sx-accent-3))',
    borderRadius: 'var(--sx-radius)',
    padding: '0.5rem',
    fontSize: '.8em',
    fontFamily:
      'Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace',
  },
})
