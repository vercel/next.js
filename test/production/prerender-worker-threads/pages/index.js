import addon from 'single-context-addon'

export const getStaticProps = () => {
  // Runs inside the static generation worker, which is the second place the addon
  // gets loaded. `next.config.js` already loaded it in the main process.
  return {
    props: {
      contextAware: addon.CONTEXT_AWARE,
    },
  }
}

export default function Page(props) {
  return <p id="props">{JSON.stringify(props)}</p>
}
