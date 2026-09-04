import { List } from "@chakra-ui/react";
import { LuLink } from "react-icons/lu";
import { FaCheckCircle } from "react-icons/fa";

import NextLink from "./common/NextLink";

const ListSection = () => {
  return (
    <List.Root gap="3" variant="plain" align="center">
      <List.Item>
        <List.Indicator asChild color="green.500">
          <FaCheckCircle />
        </List.Indicator>
        <NextLink href="https://chakra-ui.com" flexGrow={1} mr={2}>
          Chakra UI <LuLink />
        </NextLink>
      </List.Item>
      <List.Item>
        <List.Indicator asChild color="green.500">
          <FaCheckCircle />
        </List.Indicator>
        <NextLink href="https://nextjs.org" flexGrow={1} mr={2}>
          Next.js <LuLink />
        </NextLink>
      </List.Item>
    </List.Root>
  );
};

export default ListSection;
