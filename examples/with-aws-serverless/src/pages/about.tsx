import React from 'react';
import Head from 'next/head';

export default () => {
  const title: string = 'About';

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div>
        <h1>{title}</h1>
        <img src='/images/bg2.png' alt={'example image'} width={500}/>
      </div>
    </>
  );
};
