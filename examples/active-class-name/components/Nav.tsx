"use client";

import ActiveLink from "./ActiveLink";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/dynamic-route", label: "Dynamic Route" },
];

const Nav = () => (
  <nav aria-label="Main navigation">
    <style jsx global>{`
      .nav-link {
        text-decoration: none;
      }

      .active:after {
        content: " (current page)";
      }
    `}</style>
    <ul className="nav">
      {links.map((link) => (
        <li key={link.href}>
          <ActiveLink
            href={link.href}
            className="nav-link"
            activeClassName="active"
          >
            {link.label}
          </ActiveLink>
        </li>
      ))}
    </ul>
  </nav>
);

export default Nav;
