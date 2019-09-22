import * as React from 'react';
import { NextPage, NextPageContext } from 'next';
import { checkDevice } from '@src/utils/device';

export type WithDeviceRouterProps = {
  isMobile: boolean;
  importPath: string;
};

export const withDeviceRouter = (Page: NextPage, pagePath: string) => {
  const WithDeviceRouter = (props: any) => <Page {...props}/>;

  WithDeviceRouter.getInitialProps = async (context: NextPageContext) => {
    console.log('[WithDeviceRouter getInitialProps]');
    const userAgent: string = context.req ? context.req.headers['user-agent']! : navigator.userAgent;
    const isMobile: boolean = checkDevice(userAgent);
    const importPath: string = isMobile ? `mobile/${pagePath}` : `pc/${pagePath}`;

    return {
      ...(Page.getInitialProps ? await Page.getInitialProps(context) : {}),
      isMobile: isMobile,
      importPath: importPath
    };
  }

  const name: string = Page.displayName || Page.name || 'Unknown';
  WithDeviceRouter.displayName = `WithDeviceRouter('${name}')`;

  return WithDeviceRouter;
};
