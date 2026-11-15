import svgUrl from './test.svg'
import dataBytes from './test.data'
import styles from './style.module.css'

export default function Page() {
  const bytesText =
    typeof dataBytes !== 'undefined' && dataBytes instanceof Uint8Array
      ? new TextDecoder().decode(dataBytes)
      : String(dataBytes)

  return (
    <div>
      <p id="svg-url">{svgUrl}</p>
      <img src={svgUrl} alt="test svg" />
      <div id="css-url" className={styles.background} />
      <p id="bytes-type">{dataBytes?.constructor?.name}</p>
      <p id="bytes-length">{dataBytes?.length ?? dataBytes?.byteLength}</p>
      <p id="bytes-text">{bytesText}</p>
    </div>
  )
}
