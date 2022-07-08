import Image from 'next/image'
import React from 'react'
import styled, { keyframes } from 'styled-components'

interface ILoaderProps {
  done: boolean
}
const Loader: React.FC<ILoaderProps> = ({ done }): JSX.Element =>
  done ? <Image src="/check.png" width={30} height={30} /> : <Spinner />

export default Loader

const spin = keyframes`
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
`
const Spinner = styled.div`
  border: 3px solid #f3f3f3;
  border-top: 3px solid rgb(235, 137, 82);
  border-radius: 50%;
  width: 25px;
  height: 25px;
  animation: ${spin} 1s linear infinite;
`
