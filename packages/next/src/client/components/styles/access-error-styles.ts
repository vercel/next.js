export const styles: Record<string, React.CSSProperties> = {
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
    display: 'inline-block',
  },

  h1: {
    display: 'inline-block',
    margin: '0 20px 0 0',
    padding: '0 23px 0 0',
    fontSize: 24,
    fontWeight: 500,
    verticalAlign: 'top',
    lineHeight: '49px',
  },

  h2: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '49px',
    margin: 0,
  },
}
