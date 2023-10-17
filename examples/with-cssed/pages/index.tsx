import { css } from 'cssed/macro'
import Head from 'next/head'
import { useState } from 'react'

import { dark, light } from '../lib/theme'

const styles = css`
  .box {
    height: 200px;
    width: 200px;
    margin: 0 auto;
    margin-top: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dark {
    background-color: ${dark};
  }
  .dark::before {
    content: '🌚';
  }
  .light {
    background-color: ${light};
  }
  .light::before {
    content: '🌞';
  }
`

export default function Home() {
  const [isDark, setDark] = useState(false)

  return (
    <>
      <Head>
        <title>With cssed</title>
      </Head>
      <div
        onClick={() => setDark((prevState) => !prevState)}
        className={styles.box + ' ' + (isDark ? styles.dark : styles.light)}
      >
        Cssed demo
      </div>
    </>
  )
}
