import 'bootstrap/dist/css/bootstrap.min.css'
import type { AppProps } from 'next/app'
import { Navbar, Container, Nav } from 'react-bootstrap'
import Link from 'next/link'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Next.js Markdoc example</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Link href="/" passHref>
                <Nav.Link>Home</Nav.Link>
              </Link>
              <Link href="/docs/hello-world" passHref>
                <Nav.Link>Markdoc example</Nav.Link>
              </Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="mt-2">
        <Component {...pageProps} />
      </Container>
    </>
  )
}

export default MyApp
