import { Button } from "@chakra-ui/react";
import Container from "./Container";
import NextLink from "./common/NextLink";

const CTA = () => {
  return (
    <Container
      py="3"
      bottom="0"
      width="full"
      maxWidth="3xl"
      position="fixed"
      flexDirection="row"
    >
      <Button
        asChild
        mx="2"
        flex="1"
        variant="outline"
        rounded="button"
        position="relative"
        colorPalette="green"
      >
        <NextLink href="https://chakra-ui.com">chakra-ui</NextLink>
      </Button>
      <Button
        asChild
        mx="2"
        flex="1"
        variant="solid"
        rounded="button"
        position="relative"
        colorPalette="green"
      >
        <NextLink href="https://github.com/vercel/next.js/blob/canary/examples/with-chakra-ui">
          View Repo
        </NextLink>
      </Button>
    </Container>
  );
};

export default CTA;
