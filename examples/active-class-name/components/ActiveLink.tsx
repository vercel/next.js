"use client";

import Link, { LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

type ActiveLinkProps = LinkProps & {
  className?: string;
  activeClassName: string;
};

export default function ActiveLink({
  href,
  className = "",
  activeClassName,
  children,
  ...props
}: PropsWithChildren<ActiveLinkProps>) {
  const currentPathname = usePathname();
  const linkPathname = typeof href === "string" ? href : href.pathname;
  return (
    <Link
      href={href}
      className={
        className +
        (currentPathname === linkPathname ? " " + activeClassName : "")
      }
      {...props}
    >
      {children}
    </Link>
  );
}
