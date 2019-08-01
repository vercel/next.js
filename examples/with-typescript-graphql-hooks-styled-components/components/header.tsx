import Link from "next/link";
import { withRouter, Router } from "next/router";
import { FunctionComponent } from "react";

type Props = {
  router: Router;
};

const Header: FunctionComponent<Props> = ({ router: { pathname } }) => (
  <header>
    <Link prefetch href="/">
      <a className={pathname === "/" ? "is-active" : ""}>Home</a>
    </Link>
    <Link prefetch href="/about">
      <a className={pathname === "/about" ? "is-active" : ""}>About</a>
    </Link>
    <style jsx>{`
      header {
        margin-bottom: 25px;
      }
      a {
        font-size: 14px;
        margin-right: 15px;
        text-decoration: none;
      }
      .is-active {
        text-decoration: underline;
      }
    `}</style>
  </header>
);

export default withRouter(Header);
