import { PullstateCore } from '../stores'

export default function Home() {
  const { UIStore } = PullstateCore.useStores()
  const isDarkMode = UIStore.useState((s) => s.isDarkMode)

  return (
    <div
      style={{
        backgroundColor: isDarkMode ? '#333' : '#CCC',
        color: isDarkMode ? '#CCC' : '#333',
      }}
    >
      <h1>Pullstate Demo</h1>

      <p>Dark Mode is {isDarkMode ? 'On' : 'Off'}</p>

      <button
        onClick={() =>
          UIStore.update((s) => {
            s.isDarkMode = !s.isDarkMode
          })
        }
      >
        Toggle Dark Mode
      </button>
    </div>
  )
}
