export function getServerSideProps(context) {

  context.res.setHeader("Cache-Control", "s-maxage=getServerSideProps");

  return {
    props: {
      now: Date.now(),
    },
  }
}

export default function Page() {
  return (
    <>
      <p>/pages-ssr-overridden</p>
    </>
  )
}
