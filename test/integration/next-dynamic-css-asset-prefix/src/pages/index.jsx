import React, { useState } from 'react'
import style from '../Content4.module.css'
import { Comp } from '../inner/k'

export default function Index() {
  const [s] = useState(true)

  if (s) {
    return (
      <>
        <div className={style.header}></div>
        <Comp />
      </>
    )
  }

  return null
}

export const getServerSideProps = () => {
  return {
    props: {},
  }
}
