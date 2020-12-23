import Head from 'next/head'
import { styled } from '@linaria/react'
import { css } from '@linaria/core'

const hello = css`
  background-color: tomato;
`

const World = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  height: 400px;
  font-size: 30px;
  color: white;
`

export default function Home() {
  return (
    <>
      <Head>
        <title>With Linaria And Typescript</title>
      </Head>
      <div className={hello}>
        <World>Linari And Typescript</World>
      </div>
    </>
  )
}
