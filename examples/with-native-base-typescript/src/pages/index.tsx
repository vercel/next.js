import React from 'react'
import {
  Center,
  useColorMode,
  Tooltip,
  IconButton,
  SunIcon,
  MoonIcon,
  Image,
  HStack,
  Text,
  Heading,
  Code,
  Link,
  VStack,
  Button,
  AspectRatio,
} from 'native-base'

// Start editing here, save and see your changes.
export default function App() {
  return (
    <Center
      flex={1}
      _dark={{ bg: 'blueGray.900' }}
      _light={{ bg: 'blueGray.50' }}
    >
      <VStack alignItems="center" space="md">
        <HStack alignItems="center" space="2xl">
          <AspectRatio w={24} ratio={1.66}>
            <Image
              source={{ uri: 'images/nextjs-logo.png' }}
              alt="NextJS Logo"
              resizeMode="contain"
            />
          </AspectRatio>
          <Text fontSize="4xl">+</Text>
          <Image
            source={{ uri: 'images/nativebase-logo.svg' }}
            alt="NativeBase Logo"
            size={24}
            resizeMode="contain"
          />
        </HStack>
        <Heading>Welcome to NativeBase</Heading>
        <Text>
          Edit <Code>src/pages/index.js</Code> and save to reload.
        </Text>
        <HStack alignItems="center" space="sm">
          <Link href="https://nextjs.org/docs/getting-started" isExternal>
            <Text
              _light={{ color: 'gray.700' }}
              _dark={{ color: 'gray.400' }}
              underline
              fontSize={'xl'}
            >
              Learn NextJS
            </Text>
          </Link>
          <Text>/</Text>
          <Link href="https://docs.nativebase.io" isExternal>
            <Text color="primary.500" underline fontSize={'xl'}>
              Learn NativeBase
            </Text>
          </Link>
        </HStack>
      </VStack>
      <ColorModeSwitch />
      <Link mt="6" href="https://docs.nativebase.io" isExternal>
        <Button variant="outline" colorScheme="coolGray">
          View Repo
        </Button>
      </Link>
    </Center>
  )
}
// Color Switch Component
function ColorModeSwitch() {
  const { colorMode, toggleColorMode } = useColorMode()
  return (
    <Tooltip
      label={colorMode === 'dark' ? 'Enable light mode' : 'Enable dark mode'}
      placement="bottom right"
      openDelay={300}
      closeOnClick={false}
    >
      <IconButton
        position="absolute"
        top={12}
        right={8}
        onPress={toggleColorMode}
        icon={colorMode === 'dark' ? <SunIcon /> : <MoonIcon />}
        accessibilityLabel="Color Mode Switch"
      />
    </Tooltip>
  )
}
