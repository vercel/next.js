export default async function Page() {
  console.log('rendering Page')
  return (
    <div>
      This test doesn't actually render any caches. It was added because when
      "use cache" was first introduced without dynamicIO there was a bug where
      we still performed a dev only warmup render which has dynamicIO semantics
      which led to the observation of hanging promise rejections in the CLI.
      `cookies()` and related Request data APIs should never be hanging promises
      when `dynamicIO` is disabled and this was corrected but this test helps
      ensure that we don't regress in this manner later
    </div>
  )
}
