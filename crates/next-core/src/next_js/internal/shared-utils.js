// Originally defined in https://github.com/vercel/next.js/blob/canary/packages/next/shared/lib/utils.ts
export async function loadGetInitialProps(App, ctx) {
  if (!App.getInitialProps) {
    if (ctx.ctx && ctx.Component) {
      return {
        pageProps: await loadGetInitialProps(ctx.Component, ctx.ctx),
      };
    }
    return {};
  }

  const props = await App.getInitialProps(ctx);

  return props;
}
