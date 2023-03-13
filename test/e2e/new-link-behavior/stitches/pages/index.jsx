import NextLink from 'next/link'
import { styled } from '../stitches.config'
import StitchesLogo from '../components/StitchesLogo'

const Box = styled('div', {})

const Text = styled('p', {
  fontFamily: '$system',
  color: '$hiContrast',
})

const Link = styled(NextLink, {
  fontFamily: '$system',
  textDecoration: 'none',
  color: '$purple600',
})

const Container = styled('div', {
  marginX: 'auto',
  paddingX: '$3',

  variants: {
    size: {
      1: {
        maxWidth: '300px',
      },
      2: {
        maxWidth: '585px',
      },
      3: {
        maxWidth: '865px',
      },
    },
  },
})

export default function Home() {
  return (
    <Box css={{ paddingY: '$6' }}>
      <Container size={{ '@initial': '1', '@bp1': '2' }}>
        <StitchesLogo />
        <Text as="h1">Hello, from Stitches.</Text>
        <Text>
          <Link href="/about">Visit About</Link>.
        </Text>
      </Container>
    </Box>
  )
}
