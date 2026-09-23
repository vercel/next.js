import { FC } from "react";
import { Flex, FlexProps } from "@chakra-ui/react";

const Container: FC<FlexProps> = ({ children, ...props }) => {
  return (
    <Flex
      direction="column"
      alignItems="center"
      justifyContent="flex-start"
      bg="gray.50"
      color="black"
      _dark={{
        bg: "gray.900",
        color: "white",
      }}
      transition="all 0.15s ease-out"
      {...props}
    >
      {children}
    </Flex>
  );
};

export default Container;
