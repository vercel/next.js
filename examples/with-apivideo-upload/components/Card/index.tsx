import React from 'react'
import styled from 'styled-components'
import Image from 'next/image'

interface ICardProps {
  content: string
  url: string
  method: 'get' | 'post'
}

const Card: React.FC<ICardProps> = ({ content, url, method }): JSX.Element => (
  <Container target="_blank" href={url}>
    <Method $method={method}>{method.toUpperCase()}</Method>
    <Content>{content}</Content>
    <ImageContainer>
      <Image src="/arrow.png" alt="Sketch arrow" width={20} height={20} />
      <p>Try it out with our API!</p>
    </ImageContainer>
  </Container>
)

export default Card

const Container = styled.a`
  border: 1px solid rgb(215, 219, 236);
  border-radius: 0.25rem;
  background-color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0.5rem;
  font-size: 0.5rem;
  position: relative;
  box-shadow: rgb(0 0 0 / 5%) 0px 2px 4px;
`

const Method = styled.div<{ $method: 'get' | 'post' }>`
  color: #ffffff;
  background-color: ${(p) => (p.$method === 'get' ? 'green' : 'blue')};
  padding: 0.3rem;
  border-radius: 2px;
  font-weight: 500;
`

const Content = styled.p`
  letter-spacing: 0.05rem;
`

const ImageContainer = styled.div`
  position: absolute;
  bottom: -25px;
  right: -105px;
  display: flex;
  gap: 5px;
  align-items: flex-end;
  p {
    margin-bottom: -3px;
    font-size: 0.5rem;
  }
`
