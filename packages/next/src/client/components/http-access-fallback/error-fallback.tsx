import { styles } from '../styles/access-error-styles'

export function HTTPAccessErrorFallback({
  status,
  message,
}: {
  status: number
  message: string
}) {
  return (
    <>
      {/* <head> */}
      <title>{`${status}: ${message}`}</title>
      {/* </head> */}
      <div style={styles.error}>
        <div>
          <style
            dangerouslySetInnerHTML={{
              /* Minified CSS from
                body { margin: 0; color: #000; background: #fff; }
                .next-error-h1 {
                  border-right: 1px solid rgba(0, 0, 0, .3);
                }

                @media (prefers-color-scheme: dark) {
                  body { color: #fff; background: #000; }
                  .next-error-h1 {
                    border-right: 1px solid rgba(255, 255, 255, .3);
                  }
                }
              */
              __html: `body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}`,
            }}
          />
          <h1 className="next-error-h1" style={styles.h1}>
            {status}
          </h1>
          <div style={styles.desc}>
            <h2 style={styles.h2}>{message}</h2>
          </div>
        </div>
      </div>
    </>
  )
}
