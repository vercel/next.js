import * as React from 'react';
import {FormattedMessage} from 'react-intl';
import Link from 'next/link';

export default function Nav() {
  return (
    <nav>
      <li>
        <Link href="/">
          <a>
            <FormattedMessage defaultMessage="Home" />
          </a>
        </Link>
      </li>
      <li>
        <Link href="/about">
          <a>
            <FormattedMessage defaultMessage="About" />
          </a>
        </Link>
      </li>

      <style jsx>{`
        nav {
          display: flex;
        }
        li {
          list-style: none;
          margin-right: 1rem;
        }
      `}</style>
    </nav>
  );
}
