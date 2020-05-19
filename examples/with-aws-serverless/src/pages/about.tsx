import React from 'react';
import Head from 'next/head';
import { GetStaticProps, GetStaticPropsContext } from 'next';

type Props = {
  title: string;
};

const About = (props: Props) => {
  return (
    <>
      <Head>
        <title>nextjs-with-aws-serveress : {props.title}</title>
      </Head>
      <div>
        <h1>{props.title}</h1>
        <img src='/images/bg2.png' alt={'example image'} width={500}/>
      </div>
    </>
  );
};

export const getStaticProps: GetStaticProps = async (context: GetStaticPropsContext) => {
  console.log('getStaticProps', context.params);

  return {
    props: {
      title: 'About'
    }
  };
};

export default About;
