import styled from 'styled-components';

const Simple = styled.div`
  width: 100%;
`;

const Interpolation = styled.div`
  content: "  ${props => props.text}  ";
`;

const SpecialCharacters = styled.div`
  content: "  ${props => props.text}  ";\n color: red;
`;

const Comment = styled.div`
  // comment
  color: red;
`

const Parens = styled.div`
  &:hover {
    color: blue;
  }
`;
