import React from 'react'
import styled from 'styled-components'
import Loader from '../Loader'

interface IStatusProps {
  done: boolean
  title: string
}
const Status: React.FC<IStatusProps> = ({ done, title }): JSX.Element => (
  <Container>
    <p>{title}</p>
    <Loader done={done} />
  </Container>
)

export default Status

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`
