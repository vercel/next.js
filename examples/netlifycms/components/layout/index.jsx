import React from 'react';
import Link from 'next/link';

const Layout = ({ children }) => {
  return (
    <React.Fragment>
      <nav>
        <Link href={'/'}>
          <a>home</a>
        </Link>
        <Link href={'/blog'}>
          <a>blog</a>
        </Link>
        <Link href={'/about'}>
          <a>about</a>
        </Link>
      </nav>
      <main>{children}</main>
      <style jsx global>{`
        nav {
          text-align: center;
        }
        nav a {
          margin-right: 2px;

          padding: 4px;
        }

        main {
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </React.Fragment>
  );
};

export default Layout;
