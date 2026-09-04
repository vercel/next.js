import { Flex, Heading } from "@chakra-ui/react";
import { FC } from "react";

interface HeroProps {
  title?: string;
}

const Hero: FC<HeroProps> = ({ title = "with-chakra-ui-typescript" }) => (
  <Flex
    h="100vh"
    bgClip="text"
    bgGradient="to-l"
    gradientFrom="heroGradientStart"
    gradientTo="heroGradientEnd"
    alignItems="center"
    justifyContent="center"
  >
    <Heading fontSize="6vw">{title}</Heading>
  </Flex>
);

export default Hero;
