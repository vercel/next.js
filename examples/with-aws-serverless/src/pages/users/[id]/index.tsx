import React from 'react';
import Head from 'next/head';
import { GetServerSideProps, GetServerSidePropsContext } from 'next';
import { findUserById } from 'src/mock/users';
import Avatar from 'src/components/Avatar';

type Props = {
  data: UserModel;
  error?: string;
};

export default (props: Props) => {
  const title: string = 'Users';

  return (
    <>
      <Head>
        <title>nextjs-with-aws-serveress : {title}</title>
      </Head>
      <div>
        {props.error ? (
          <h1>{props.error}</h1>
        ) : (
          <>
            <h1>{props.data.id}</h1>
            <Avatar data={props.data} size={'big'}/>
          </>
        )}
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const userId: string = Array.isArray(context.query.id) ? context.query.id[0] : (context.query.id || '');
  const user: UserModel | undefined = findUserById(userId);

  if (!user) {
    return {
      props: {
        error: 'INVALID USER ID'
      }
    };
  }

  return {
    props: {
      data: user
    }
  };
};
