if (!('hot' in Math)) Math.hot = false

export default function page({ hot }) {
  return `${hot ? 'HOT' : 'COLD'}`
}

export async function getServerSideProps() {
  const wasHot = Math.hot
  Math.hot = true

  // crash the server after responding
  if (process.env.CRASH_FUNCTION) {
    setTimeout(() => {
      throw new Error('crash')
    }, 700)
  }

  return {
    props: {
      hot: wasHot,
    },
  }
}
