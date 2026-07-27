"use client";

import ActiveLink from "./ActiveLink";

const Nav = () => (
  <nav>
    <style jsx global>{`
      .nav-link {
        text-decoration: none;
      }

      .active:after {
        content: " (current page)";
      }
    `}</style>
    <ul className="nav">
      <li>
        <ActiveLink activeClassName="active" className="nav-link" href="/">
          Home
        </ActiveLink>
      </li>
      <li>
        <ActiveLink activeClassName="active" className="nav-link" href="/about">
          About
        </ActiveLink>
      </li>
      <li>
        <ActiveLink activeClassName="active" className="nav-link" href="/blog">
          Blog
        </ActiveLink>
      </li>
      <li>
        <ActiveLink
          activeClassName="active"
          className="nav-link"
          href="/dynamic-route"
        >
          Dynamic Route
        </ActiveLink>
      </li>
    </ul>
  </nav>
);

export default Nav;
