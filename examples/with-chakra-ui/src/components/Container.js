import { Flex } from '@chakra-ui/react'

export const Container = (props) => (
  <Flex
    direction="column"
    alignItems="center"
    justifyContent="flex-start"
    bg="gray.50"
    color="black"
    _dark={{
      bg: 'gray.900',
      color: 'white',
    }}
    transition="all 0.15s ease-out"
    {...props}
  />
)
