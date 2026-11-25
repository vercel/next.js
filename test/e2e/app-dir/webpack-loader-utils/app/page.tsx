import utils from './input.utils-test'
import styleLoaderSource from './styles.style-test.txt'

export default function Page() {
  return (
    <>
      <pre id="utils">{JSON.stringify(utils)}</pre>
      <pre id="style-loader-source">{styleLoaderSource}</pre>
    </>
  )
}
