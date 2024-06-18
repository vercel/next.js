import { useRouter } from "next/router";
import Link, { LinkProps } from "next/link";
import React, { PropsWithChildren, useEffect, useState } from "react";
import { NextRouter } from "next/src/shared/lib/router/router";
import { resolveHref } from "next/dist/client/resolve-href";

const getLinkUrl = (params: {
  router: NextRouter;
  href: LinkProps["href"];
  as: LinkProps["as"];
}): string => {
  // Dynamic route will be matched via props.as
  // Static route will be matched via props.href
  if (params.as) return resolveHref(params.router, params.as);

  const [resolvedHref, resolvedAs] = resolveHref(
    params.router,
    params.href,
    true,
  );

  return resolvedAs || resolvedHref;
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
  const router = useRouter();
  const [computedClassName, setComputedClassName] = useState(className);

  useEffect(() => {
    // Check if the router fields are updated client-side
    if (router.isReady) {
      const linkUrl = getLinkUrl({
        router,
        href: props.href,
        as: props.as,
      });

      const linkPathname = new URL(linkUrl, location.href).pathname;

      // Using URL().pathname to get rid of query and hash
      const activePathname = new URL(router.asPath, location.href).pathname;

      const newClassName =
        linkPathname === activePathname
          ? `${className} ${activeClassName}`.trim()
          : className;

      if (newClassName !== computedClassName) {
        setComputedClassName(newClassName);
      }
    }
  }, [
    router,
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
