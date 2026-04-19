import Head from "next/head";
import {
  Container,
  Row,
  Col,
  Button,
  Card,
  CardText,
  CardTitle,
  CardBody,
} from "reactstrap";

export default function Home() {
  return (
    <Container className="md-container">
      <Head>
        <title>ReactJS with reactstrap</title>
        <link rel="icon" href="/favicon-32x32.png" />
      </Head>
      <Container>
        <h1>
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>
        <p>
          Get started by editing <code>pages/index.js</code>
        </p>
        <Container>
          <Row>
            <Col sm="6">
              <Card className="my-3">
                <CardBody>
                  <CardTitle tag="h5">Documentation</CardTitle>
                  <CardText>
                    Find in-depth information about Next.js features and API.
                  </CardText>
                  <Button color="primary" href="https://nextjs.org/docs">
                    More &rarr;
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col sm="6">
              <Card className="my-3">
                <CardBody>
                  <CardTitle tag="h5">Learn</CardTitle>
                  <CardText>
                    Learn about Next.js in an interactive course with quizzes!
                  </CardText>
                  <Button color="primary" href="https://nextjs.org/learn">
                    More &rarr;
                  </Button>
                </CardBody>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col sm="6">
              <Card className="my-3">
                <CardBody>
                  <CardTitle tag="h5">Examples</CardTitle>
                  <CardText>
                    Discover and deploy boilerplate example Next.js projects.
                  </CardText>
                  <Button
                    color="primary"
                    href="https://github.com/vercel/next.js/tree/canary/examples"
                  >
                    More &rarr;
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col sm="6">
              <Card className="my-3">
                <CardBody>
                  <CardTitle tag="h5">Deploy</CardTitle>
                  <CardText>
                    Instantly deploy your Next.js site to a public URL with
                    Vercel.
                  </CardText>
                  <Button
                    color="primary"
                    href="https://vercel.com/new?utm_source=github&utm_medium=example&utm_campaign=next-example"
                  >
                    More &rarr;
                  </Button>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </Container>

      <footer className="cntr-footer">
        <a
          href="https://vercel.com?filter=next.js&utm_source=github&utm_medium=example&utm_campaign=next-example"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <img src="/vercel.svg" alt="Vercel Logo" className="sml-logo" />
        </a>
      </footer>
    </Container>
  );
}
