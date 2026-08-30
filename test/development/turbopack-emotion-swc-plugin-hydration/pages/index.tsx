import styled from '@emotion/styled'
import { useEffect } from 'react'

const StyledButton = styled.button`
  color: hotpink;
`

export default function Page({ message }: { message: string }) {
  useEffect(() => {
    document
      .getElementById('styled-button')
      ?.setAttribute('data-client-target', StyledButton.toString())
  }, [])

  return (
    <StyledButton
      id="styled-button"
      data-custom-attribute="removed-by-swc-plugin"
      data-server-target={StyledButton.toString()}
    >
      {message}
    </StyledButton>
  )
}

export function getServerSideProps() {
  return { props: { message: 'rendered with SSR' } }
}
