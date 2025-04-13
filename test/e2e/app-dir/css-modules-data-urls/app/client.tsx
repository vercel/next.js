// @ts-expect-error
// .client{font-weight:700}
import styles from 'data:text/css+module;base64,LmNsaWVudHtmb250LXdlaWdodDo3MDB9Cg=='

export const ClientComponent = () => {
  return (
    <div id="client" className={`${styles.client}`}>
      This text should be bold
    </div>
  )
}
