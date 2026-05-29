import { PropsWithChildren } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { RouterProps } from "./types";

const CustomLink: React.FC<PropsWithChildren<{ to: string }>> = ({
  to,
  children,
}) => {
  const router = useRouter();
  const { pathname } = router;
  const { cacheStrategy } = router.query as RouterProps;
  const linkPathname = `/${to}/[cacheStrategy]`;
  const className = `nav-link${pathname === linkPathname ? " active" : ""}`;
  return (
    <div>
      <Link
        href={{
          pathname: linkPathname,
          query: { cacheStrategy },
        }}
        scroll={false}
        className={className}
      >
        {children}
      </Link>
    </div>
  );
};

export const Nav: React.FC = () => {
  return (
    <nav className="nav">
      <CustomLink to="home">Home</CustomLink>
      <CustomLink to="signin">Sign in</CustomLink>
    </nav>
  );
};
