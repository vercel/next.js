/**
 * Next.js with react-bootstrap support
 *
 * @from  : https://www.marinethinking.ca/
 * @author: lwz7512@gmail.com
 * @date  : 2020/05/01
 */

import Head from 'next/head'
import { Container, Row } from 'react-bootstrap'
import Footer from '../components/footer'
import Card from '../components/card'

export default function Home() {
  return (
    <Container>
      <Head>
        <title>MT-SPA</title>
        <link rel="icon" href="/favicon-32x32.png" />
      </Head>

      <main>
        <h1 className="title">
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className="description">
          Get started by editing <code>pages/index.js</code>
        </p>

        <Container>
          <Row>
            <Card
              href="https://nextjs.org/docs"
              title="Documentation"
              text="Find in-depth information about Next.js features and API."
            />
            <Card
              href="https://nextjs.org/learn"
              title="Learn"
              text="Learn about Next.js in an interactive course with quizzes!"
            />
          </Row>

          <Row>
            <Card
              href="https://github.com/zeit/next.js/tree/master/examples"
              title="Examples"
              text="Discover and deploy boilerplate example Next.js projects."
            />
            <Card
              href="https://www.marinethinking.ca/"
              title="Developer of this starter"
              text="Discover more from here."
            />
          </Row>
        </Container>
      </main>

      <Footer />
    </Container>
  )
}
