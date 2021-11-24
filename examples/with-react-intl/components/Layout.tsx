import * as React from 'react';
import {useIntl} from 'react-intl';
import Head from 'next/head';
import Nav from './Nav';

export default function Layout({title, children}) {
  const intl = useIntl();

  return (
    <div>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>
          {title ||
            intl.formatMessage({
              defaultMessage: 'React Intl Next.js Example',
            })}
        </title>
      </Head>

      <header>
        <Nav />
      </header>

      {children}
    </div>
  );
}
