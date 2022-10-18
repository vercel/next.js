import styled from '@emotion/styled'

const SelectedComponent = styled.p`
  color: red;

  &:after {
    content: ' | ';
  }
`
