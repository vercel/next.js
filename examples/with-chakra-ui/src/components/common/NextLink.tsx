import { FC } from "react";
import Link, { LinkProps } from "next/link";
import {
  Link as ChakraLink,
  LinkProps as ChakraLinkProps,
} from "@chakra-ui/react";

type NextLinkProps = ChakraLinkProps & LinkProps;

const NextLink: FC<NextLinkProps> = ({ href, children, ...rest }) => {
  return (
    <ChakraLink asChild {...rest}>
      <Link href={href}>{children}</Link>
    </ChakraLink>
  );
};

export default NextLink;
