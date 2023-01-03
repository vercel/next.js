import React from 'react'

const styles: { [k: string]: React.CSSProperties } = {
  error: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },

  desc: {
    display: 'inline-block',
    textAlign: 'left',
    lineHeight: '49px',
    height: '49px',
    verticalAlign: 'middle',
  },

  h1: {
    display: 'inline-block',
    margin: 0,
    marginRight: '20px',
    padding: '0 23px 0 0',
    fontSize: '24px',
    fontWeight: 500,
    verticalAlign: 'top',
    lineHeight: '49px',
  },

  h2: {
    fontSize: '14px',
    fontWeight: 'normal',
    lineHeight: '49px',
    margin: 0,
    padding: 0,
  },
}

export function NotFound() {
  return (
    <div style={styles.error}>
      <head>
        <title>404: This page could not be found.</title>
      </head>
      <div>
        <style
          dangerouslySetInnerHTML={{
            __html: `
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
          `,
          }}
        />
        <h1 className="next-error-h1" style={styles.h1}>
          404
        </h1>
        <div style={styles.desc}>
          <h2 style={styles.h2}>This page could not be found.</h2>
        </div>
      </div>
    </div>
  )
}
