import Image from 'next/image';
import {
  Box,
  chakra,
  Code,
  Flex,
  Grid,
  GridItem,
  Heading,
  Icon,
  IconButton,
  Text,
  Tooltip,
  useColorMode,
} from '@chakra-ui/react';
import { BsArrowRightShort } from 'react-icons/bs';
import { FiMoon, FiSun } from 'react-icons/fi';
import Head from 'next/head';

interface HomeCardProps {
  title: string;
  description: string;
  url: string;
}

function SwitchColorModeButton(): JSX.Element {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <Tooltip
      hasArrow
      shouldWrapChildren
      label={colorMode === 'light' ? 'Dark mode' : 'Light mode'}
      placement="left"
    >
      <IconButton
        onClick={toggleColorMode}
        aria-label={colorMode === 'light' ? 'Dark mode' : 'Light mode'}
        icon={colorMode === 'light' ? <FiMoon /> : <FiSun />}
        variant="ghost"
      />
    </Tooltip>
  );
}

function HomeCard({ title, description, url }: HomeCardProps) {
  const { colorMode } = useColorMode();

  return (
    <GridItem
      bgColor={colorMode === 'light' ? 'white' : 'gray.800'}
      as="a"
      display="block"
      href={url}
      target="_blank"
      borderWidth="1px"
      borderStyle="solid"
      borderColor={colorMode === 'light' ? 'gray.300' : 'gray.600'}
      borderRadius={4}
      padding={6}
      transition="all 0.2s ease"
      _hover={{
        borderColor: 'blue.400',
        color: 'blue.400',
      }}
    >
      <Heading
        as="h2"
        fontSize="xl"
        margin="0 0 1rem 0"
        display="flex"
        flexDirection="row"
        alignItems="center"
      >
        <Text as="span" marginRight={2}>
          {title}
        </Text>
        <Icon as={BsArrowRightShort} />
      </Heading>
      <Text fontSize="lg" lineHeight="base">
        {description}
      </Text>
    </GridItem>
  );
}

export default function Home(): JSX.Element {
  const { colorMode } = useColorMode();

  return (
    <>
      <Head>
        <title>Create Next App</title>
      </Head>
      <Flex
        direction="column"
        width="100%"
        height="100%"
        minHeight="100vh"
        bgColor={colorMode === 'light' ? 'gray.50' : 'gray.700'}
        position="relative"
      >
        <Box position="absolute" top="1rem" right="1rem">
          <SwitchColorModeButton />
        </Box>
        <Flex
          className="1"
          direction="column"
          flex="1"
          alignItems="center"
          justifyContent="center"
          width="100%"
          maxW="820px"
          margin="0 auto"
          p={{ base: '1rem', md: '0' }}
        >
          <Flex
            as="head"
            direction={{ base: 'column-reverse', md: 'row' }}
            align="center"
            justify="space-between"
            w="100%"
            p="2rem"
          >
            <Box>
              <Heading
                as="h1"
                fontSize="4xl"
                textAlign={{ base: 'center', md: 'left' }}
              >
                Welcome to{' '}
                <chakra.a
                  href="http://www.nextjs.org"
                  target="_blank"
                  rel="noreferrer"
                  color="blue.400"
                  _hover={{ color: 'blue.600' }}
                >
                  Next.js!
                </chakra.a>
              </Heading>
              <Heading
                as="h3"
                fontSize="lg"
                marginTop="0.5rem"
                textAlign={{ base: 'center', md: 'left' }}
              >
                With Typescript, ESLint, Prettier, Chakra UI and React Icons.
              </Heading>
              <Text
                fontSize="xl"
                marginTop="1rem"
                textAlign={{ base: 'center', md: 'left' }}
              >
                Get started by editing{' '}
                <Code
                  bgColor={colorMode === 'light' ? 'gray.200' : 'gray.800'}
                  fontSize="large"
                >
                  pages/index.js
                </Code>
              </Text>
            </Box>

            <Box>
              <Image
                src="/img/man-with-laptop.svg"
                alt="Man with laptop"
                width={209}
                height={160}
              />
            </Box>
          </Flex>

          <Grid
            as="main"
            marginTop="4rem"
            templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
            gap={{ base: 4, md: 8 }}
          >
            <HomeCard
              title="Documentation"
              description="Find in-depth information about Next.js features and API."
              url="https://nextjs.org/docs"
            />
            <HomeCard
              title="Learn"
              description="Learn about Next.js in an interactive course with quizzes!"
              url="https://nextjs.org/learn"
            />
            <HomeCard
              title="Examples"
              description="Discover and deploy boilerplate example Next.js projects."
              url="https://github.com/vercel/next.js/tree/master/examples"
            />
            <HomeCard
              title="Deploy"
              description="Instantly deploy your Next.js site to a public URL with Vercel."
              url="https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            />
          </Grid>
        </Flex>

        <Flex
          as="footer"
          borderWidth="1px"
          borderStyle="solid"
          borderColor={colorMode === 'light' ? 'gray.200' : 'gray.700'}
          p="2rem"
        >
          <Flex
            as="a"
            href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
            width="100%"
            direction="row"
            alignItems="center"
            justifyContent="center"
          >
            <Box lineHeight="24px">Powered by</Box>
            <Box ml="0.5rem" h={4}>
              <Image
                src={
                  colorMode === 'light'
                    ? '/img/vercel.svg'
                    : '/img/vercel-darkmode.svg'
                }
                alt="Vercel Logo"
                width={72}
                height={16}
              />
            </Box>
          </Flex>
        </Flex>
      </Flex>
    </>
  );
}
