"use client";

import Link, { LinkProps } from "next/link";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const getLinkUrl = (href: LinkProps["href"], as?: LinkProps["as"]): string => {
  // Dynamic route will be matched via props.as
  // Static route will be matched via props.href
  if (as) return as.toString();
  return href.toString();
};

type ActiveLinkProps = LinkProps & {
  className?: string;
  activeClassName: string;
};

const ActiveLink = ({
  children,
  activeClassName,
  className,
  ...props
}: PropsWithChildren<ActiveLinkProps>) => {
  const pathname = usePathname();
  const [computedClassName, setComputedClassName] = useState(className);

  useEffect(() => {
    if (pathname) {
      const linkUrl = getLinkUrl(props.href, props.as);

      const linkPathname = new URL(linkUrl, location.href).pathname;
      const activePathname = new URL(pathname, location.href).pathname;

      const newClassName =
        linkPathname === activePathname
          ? `${className} ${activeClassName}`.trim()
          : className;

      if (newClassName !== computedClassName) {
        setComputedClassName(newClassName);
      }
    }
  }, [
    pathname,
    props.as,
    props.href,
    activeClassName,
    className,
    computedClassName,
  ]);

  return (
    <Link className={computedClassName} {...props}>
      {children}
    </Link>
  );
};

export default ActiveLink;
