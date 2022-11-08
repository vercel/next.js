import Head from 'next/head'
import {
  Page,
  Text,
  Image,
  Display,
  Button,
  Grid,
  Spacer,
} from '@geist-ui/core'
import { Github } from '@geist-ui/icons'

const gh = 'https://github.com/geist-org/geist-ui'
const docs = 'https://geist-ui.dev'

export default function Home() {
  const redirect = (url: string) => window.open(url)

  return (
    <div>
      <Head>
        <title>Geist UI with NextJS</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Page dotBackdrop width="800px" padding={0}>
        <Display
          title="Geist UI"
          caption={
            <>
              Example repository of{' '}
              <Text span b>
                Next.js
              </Text>{' '}
              &{' '}
              <Text b i style={{ letterSpacing: '0.6px' }}>
                <Text span type="success">
                  G
                </Text>
                <Text span type="warning">
                  e
                </Text>
                <Text span type="secondary">
                  i
                </Text>
                <Text span type="error">
                  s
                </Text>
                <Text span style={{ color: '#ccc' }}>
                  t
                </Text>
                <Text span type="success" ml="5px">
                  UI.
                </Text>
              </Text>{' '}
            </>
          }
        >
          <Image
            src="/geist-banner.png"
            alt="geist ui banner"
            draggable={false}
          />
        </Display>
        <Grid.Container justify="center" gap={3} mt="100px">
          <Grid xs={20} sm={7} justify="center">
            <Button
              shadow
              type="secondary-light"
              width="100%"
              onClick={() => redirect(gh)}
            >
              <Github size={20} />
              <Spacer inline w={0.35} />
              GitHub Repo
            </Button>
          </Grid>
          <Grid xs={0} sm={3} />
          <Grid xs={20} sm={7} justify="center">
            <Button width="100%" onClick={() => redirect(docs)}>
              Documentation Site
            </Button>
          </Grid>
        </Grid.Container>
      </Page>
    </div>
  )
}
