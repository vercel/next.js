import { Code, Text } from "@chakra-ui/react";

import CTA from "../src/components/CTA";
import Hero from "../src/components/Hero";
import Main from "../src/components/Main";
import Footer from "../src/components/Footer";
import Container from "../src/components/Container";
import ListSection from "../src/components/ListSection";
import ColorModeToggle from "../src/components/ColorModeToggle";

const Index: React.FC = () => {
  return (
    <Container height="100vh">
      <ColorModeToggle />
      <Hero />
      <Main>
        <Text color="text">
          Example repository of <Code>Next.js</Code> + <Code>chakra-ui</Code> +{" "}
          <Code>TypeScript</Code>.
        </Text>
        <ListSection />
      </Main>
      <Footer>
        <Text>Next ❤️ Chakra</Text>
      </Footer>
      <CTA />
    </Container>
  );
};

export default Index;
