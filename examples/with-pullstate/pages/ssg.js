import DarkModeDemo from '../components/dark-mode-demo'

export default function SSG() {
  return <DarkModeDemo />
}

export async function getStaticProps() {
  const instance = PullstateCore.instantiate()

  // Example of fetching data from some api
  const preferences = await new Promise((resolve) =>
    resolve({ isDarkMode: false })
  )

  // Update the store on the server before page render
  instance.stores.UIStore.update((s) => {
    s.isDarkMode = preferences.isDarkMode
  })

  return {
    props: {
      snapshot: JSON.stringify(instance.getPullstateSnapshot()),
    },
  }
}
