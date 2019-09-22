import * as React from 'react';
import { withDeviceRouter, WithDeviceRouterProps } from '@src/hocs/withDeviceRouter';
import { NextPageContext } from 'next';
import dynamic from 'next/dynamic'

type MainPageProps = {
  name: string
};

const MainPage = (props: MainPageProps & WithDeviceRouterProps) => {
  const MainPage = dynamic(import(`@src/${props.importPath}`));
  return (
    <>
      <MainPage/>
    </>
  );
}

MainPage.getInitialProps = (context: NextPageContext): any => {
  console.log('MainPage. getInitialProps', context.req ? 'it is server' : 'it is client');
  return { name: 'MainPage' };
};

export default withDeviceRouter(MainPage, 'MainPage');
