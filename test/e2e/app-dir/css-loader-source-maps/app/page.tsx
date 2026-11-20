import styles from '../theme.mapped.module.css'
import plain from '../plain.module.css'

export default function Page() {
  return (
    <>
      <div id="box" className={styles.box}>
        Main source
      </div>
      <div id="imported" className={styles.importedBefore}>
        Imported source
      </div>
      <div id="plain" className={plain.plain}>
        Untransformed source
      </div>
    </>
  )
}
