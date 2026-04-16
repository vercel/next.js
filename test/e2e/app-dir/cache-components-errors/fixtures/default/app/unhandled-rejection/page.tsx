export default async function Page() {
  // This promise will reject before we abort during prerendering
  Promise.reject('BOOM')

  // This promise will reject after we abort during prerendering
  setTimeout(() => {
    Promise.reject('BAM')
  }, 10)

  return (
    <>
      <p>
        This page tests unhandled rejection suppression after prerender abort.
      </p>
      <p>
        With cache components enabled, this page produces a partial static shell
        and it has one early rejection "BOOM" which will show up but two late
        rejections which should not
      </p>
    </>
  )
}
