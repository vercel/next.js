if (!('hot' in Math)) Math.hot = false

export default function page({ hot }) {
  return `${hot ? 'HOT' : 'COLD'}`
}

export async function getServerSideProps() {
  const wasHot = Math.hot
  Math.hot = true

  return {
    props: {
      hot: wasHot,
    },
  }
}

export const config = {
  runtime: 'experimental-edge',
}
