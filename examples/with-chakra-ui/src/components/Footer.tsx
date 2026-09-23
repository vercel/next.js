import { Flex, FlexProps } from "@chakra-ui/react";
import { FC } from "react";

const Footer: FC<FlexProps> = (props) => (
  <Flex as="footer" py="8rem" {...props} />
);

export default Footer;
