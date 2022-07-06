export async function getServerSideProps(ctx) {
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

export default function Component() {
  return 'gssp-redirect'
}
