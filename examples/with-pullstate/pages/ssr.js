import DarkModeDemo from '../components/dark-mode-demo'
import { PullstateCore } from '../stores'

export default function SSR() {
  return <DarkModeDemo />
}

export async function getServerSideProps() {
  const instance = PullstateCore.instantiate({ ssr: true })

  // Example of fetching data from some api
  const preferences = await new Promise((resolve) =>
    resolve({ isDarkMode: false })
  )

  // Update the store on the server before page load
  instance.stores.UIStore.update((s) => {
    s.isDarkMode = preferences.isDarkMode
  })

  return {
    props: {
      snapshot: JSON.stringify(instance.getPullstateSnapshot()),
    },
  }
}
