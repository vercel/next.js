import Link from 'next/link'
import {
  Generic,
  Container,
  Content,
  Navbar,
  Section,
  Hero,
  Title,
  Footer,
} from 'rbx'

const Layout = ({ children }) => {
  return (
    <Generic>
      <Navbar fixed="top" color="primary">
        <Navbar.Brand>
          <Navbar.Item href="#">Bulma</Navbar.Item>
          <Navbar.Burger />
        </Navbar.Brand>
        <Navbar.Menu>
          <Navbar.Segment align="start">
            <Link href="/">
              <Navbar.Item>Home</Navbar.Item>
            </Link>
            <Link href="/about">
              <Navbar.Item>About</Navbar.Item>
            </Link>
            <Link href="/contact">
              <Navbar.Item>Contact</Navbar.Item>
            </Link>
          </Navbar.Segment>
        </Navbar.Menu>
      </Navbar>
      <Section backgroundColor="primary">
        <Hero>
          <Hero.Body>
            <Container>
              <Title as="h1" align="center" color="white">
                Welcome to Next!
              </Title>
            </Container>
          </Hero.Body>
        </Hero>
      </Section>
      <Container>
        <Content>{children}</Content>
      </Container>
      <Footer>
        <Content textAlign="centered">
          <p>&copy; ZEIT, Inc. All rights reserved.</p>
        </Content>
      </Footer>
    </Generic>
  )
}

export default Layout
