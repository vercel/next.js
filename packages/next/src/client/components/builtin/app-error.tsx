import React from 'react'

const styles: Record<string, React.CSSProperties> = {
  error: {
    // https://github.com/sindresorhus/modern-normalize/blob/main/modern-normalize.css#L38-L52
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: {
    lineHeight: '48px',
  },
  h1: {
    display: 'inline-block',
    margin: '0 20px 0 0',
    paddingRight: 23,
    fontSize: 24,
    fontWeight: 500,
    verticalAlign: 'top',
  },
  h2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '28px',
  },
  wrap: {
    display: 'inline-block',
  },
} as const

/* CSS minified from
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
const themeCss = `body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}`

function AppError() {
  const errorMessage = 'Internal Server Error.'
  const title = `500: ${errorMessage}`
  return (
    <html id="__next_error__">
      <head>
        <title>{title}</title>
      </head>
      <body>
        <div style={styles.error}>
          <div style={styles.desc}>
            <style
              dangerouslySetInnerHTML={{
                __html: themeCss,
              }}
            />
            <h1 className="next-error-h1" style={styles.h1}>
              500
            </h1>
            <div style={styles.wrap}>
              <h2 style={styles.h2}>{errorMessage}</h2>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}

export default AppError
