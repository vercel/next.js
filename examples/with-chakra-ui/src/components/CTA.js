import Link from 'next/link'
import { Link as ChakraLink, Button } from '@chakra-ui/core'

import { Container } from './Container'

export const CTA = () => (
  <Container
    flexDirection="row"
    position="fixed"
    bottom="0"
    width="100%"
    maxWidth="48rem"
    py={2}
  >
    <Link isExternal href="https://chakra-ui.com">
      <ChakraLink isExternal href="https://chakra-ui.com" flexGrow={1} mx={2}>
        <Button width="100%" variant="outline" variantColor="green">
          chakra-ui
        </Button>
      </ChakraLink>
    </Link>
    <Link
      isExternal
      href="https://github.com/zeit/next.js/blob/canary/examples/with-chakra-ui"
    >
      <ChakraLink
        isExternal
        href="https://github.com/zeit/next.js/blob/canary/examples/with-chakra-ui"
        flexGrow={3}
        mx={2}
      >
        <Button width="100%" variant="solid" variantColor="green">
          View Repo
        </Button>
      </ChakraLink>
    </Link>
  </Container>
)
