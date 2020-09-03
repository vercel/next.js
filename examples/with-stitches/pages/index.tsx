import Head from 'next/head'
import { styled } from '../stitches.config'

const Box = styled('div', {})

const Text = styled('p', {
  fontFamily: '$system',
  color: '$hiContrast',
})

const Link = styled('a', {
  fontFamily: '$system',
  textDecoration: 'none',
  color: '$purple600',
})

const Container = styled('div', {
  marginX: 'auto',
  paddingX: '$3',

  variants: {
    size: {
      '1': {
        maxWidth: '300px',
      },
      '2': {
        maxWidth: '585px',
      },
      '3': {
        maxWidth: '865px',
      },
    },
  },
})

export default function Home() {
  return (
    <Box css={{ paddingY: '$6' }}>
      <Head>
        <title>Use Stitches with Next.js</title>
      </Head>
      <Container size={{ initial: '1', bp1: '2' }}>
        <StitchesLogo />
        <Text as="h1">Hello, from Stitches.</Text>
        <Text>
          For full documentation, visit{' '}
          <Link href="https://stitches.dev">stitches.dev</Link>.
        </Text>
      </Container>
    </Box>
  )
}

export const StitchesLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="35"
    height="35"
    viewBox="0 0 35 35"
    fill="none"
  >
    <circle
      cx="17.5"
      cy="17.5"
      r="14.5"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M12.8184 31.3218L31.8709 20.3218" stroke="currentColor" />
    <path d="M3.31836 14.8674L22.3709 3.86743" stroke="currentColor" />
    <path
      d="M8.65332 29.1077L25.9738 19.1077"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.21582 16.0815L26.5363 6.08154"
      stroke="currentColor"
      strokeLinecap="round"
    />
    <path
      d="M13.2334 14.2297L22.5099 21.1077"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16.6973 12.2302L25.9736 19.1078"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.21582 16.0815L19.0459 23.1078"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
