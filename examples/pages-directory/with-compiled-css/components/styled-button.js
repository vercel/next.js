import { styled } from '@compiled/react'

export const Button = styled.button`
  color: ${(props) => props.color};
  background-color: transparent;
  padding: 6px 8px;
  border-radius: 3px;
  width: 100%;
  font-family: sans-serif;
  border: 1px solid ${(props) => props.color};
`
