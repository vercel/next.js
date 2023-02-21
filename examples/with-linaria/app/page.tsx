import Image from 'next/image';
import { styled } from '@linaria/react';

const Main = styled.main`
  min-height: 100vh;
  padding: 4rem 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const Title = styled.h1`
  margin: 0;
  line-height: 1.15;
  font-size: 4rem;
  font-style: normal;
  font-weight: 800;
  letter-spacing: -0.025em;

  & a {
    text-decoration: none;
    color: #0070f3;
  }

  & a:hover,
  & a:focus,
  & a:active {
    text-decoration: underline;
  }
`;

const Description = styled.p`
  margin: 4rem 0;
  line-height: 1.5;
  font-size: 1.5rem;
  text-align: center;
`;

const Code = styled.code`
  background: #fafafa;
  border-radius: 5px;
  padding: 0.75rem;
  font-size: 1.1rem;
  font-family: Menlo, Monaco, Lucida Console, Liberation Mono, DejaVu Sans Mono,
    Bitstream Vera Sans Mono, Courier New, monospace;
`;

const Grid = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 1200px;
  @media (max-width: 600px) {
    width: 100%;
    flex-direction: column;
  }
`;
const Footer = styled.footer`
  display: flex;
  flex: 1;
  padding: 2rem 0;
  border-top: 1px solid #eaeaea;
  justify-content: center;
  align-items: center;
  & a {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-grow: 1;
  }
`;

const Logo = styled.span`
  height: 1em;
  margin-left: 0.5rem;
`;

const Card = styled.a`
  margin: 1rem;
  padding: 1.5rem;
  text-align: left;
  color: inherit;
  text-decoration: none;
  border: 1px solid #eaeaea;
  border-radius: 10px;
  transition: color 0.15s ease, border-color 0.15s ease;
  max-width: 300px;

  &:hover,
  &:focus,
  &:active {
    color: #0070f3;
    border-color: #0070f3;
  }
  & h2 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
  }
  
  & p {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.5;
  }
`;

const Container = styled.div`
  padding: 0 2rem;
 
  @media (prefers-color-scheme: dark) {
    ${Title} {
      background: linear-gradient(180deg, #ffffff 0%, #aaaaaa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-fill-color: transparent;
    }
    ${Title} a {
      background: linear-gradient(180deg, #0070f3 0%, #0153af 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-fill-color: transparent;
    }
    ${Card},
    ${Footer} {
      border-color: #222;
    }
    ${Code} {
      background: #111;
    }
    ${Logo} img {
      filter: invert(1);
    }
  }

`;

export default function Home() {
  return (
    <Container>
      <Main>
        <Title>
          Welcome to <a href="https://nextjs.org">Next.js 13 with Linaria!</a>
        </Title>

        <Description>
          Get started by editing <Code>app/page.tsx</Code>
        </Description>

        <Grid>
          <Card href="https://beta.nextjs.org/docs">
            <h2>Documentation &rarr;</h2>
            <p>Find in-depth information about Next.js 13</p>
          </Card>

          <Card href="https://github.com/vercel/next.js/tree/canary/examples">
            <h2>Examples &rarr;</h2>
            <p>Explore the Next.js 13 playground.</p>
          </Card>

          <Card
            href="https://vercel.com/templates/next.js/app-directory?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <h2>Deploy &rarr;</h2>
            <p>Deploy your Next.js site to a public URL with Vercel.</p>
          </Card>
        </Grid>
      </Main>

      <Footer>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{' '}
          <Logo>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </Logo>
        </a>
      </Footer>
    </Container>
  );
}
