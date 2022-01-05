import Head from 'next/head'
import {
  Container,
  Main,
  Title,
  TitleLink,
  Description,
  Code,
  Grid,
  Card,
  CardTitle,
  CardDetail,
  Footer,
  FooterLink,
  FooterImage,
} from 'components'

export default function Home() {
  return (
    <Container>
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Main>
        <Title>
          Welcome to <TitleLink href="https://nextjs.org">Next.js!</TitleLink>
        </Title>

        <Description>
          Get started by editing <Code>pages/index.tsx</Code>
        </Description>

        <Grid>
          <Card href="https://nextjs.org/docs">
            <CardTitle>Documentation &rarr;</CardTitle>
            <CardDetail>
              Find in-depth information about Next.js features and API.
            </CardDetail>
          </Card>

          <Card href="https://nextjs.org/learn">
            <CardTitle>Learn &rarr;</CardTitle>
            <CardDetail className="mt-4 text-xl">
              Learn about Next.js in an interactive course with quizzes!
            </CardDetail>
          </Card>

          <Card href="https://github.com/vercel/next.js/tree/master/examples">
            <CardTitle>Examples &rarr;</CardTitle>
            <CardDetail>
              Discover and deploy boilerplate example Next.js projects.
            </CardDetail>
          </Card>

          <Card href="https://vercel.com/import?filter=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app">
            <CardTitle>Deploy &rarr;</CardTitle>
            <CardDetail>
              Instantly deploy your Next.js site to a public URL with Vercel.
            </CardDetail>
          </Card>
        </Grid>
      </Main>

      <Footer>
        <FooterLink
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by <FooterImage src="/vercel.svg" alt="Vercel Logo" />
        </FooterLink>
      </Footer>
    </Container>
  )
}