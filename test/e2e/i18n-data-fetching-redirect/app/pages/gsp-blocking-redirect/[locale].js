export async function getStaticProps(ctx) {
  let toLocale = ctx.params.locale
  if (toLocale === 'from-ctx') {
    toLocale = ctx.locale
  }

  return {
    redirect: {
      destination: `/${toLocale}/home`,
      permanent: false,
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function Component() {
  return 'gsp-blocking-redirect'
}
