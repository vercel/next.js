import styled from 'styled-components';

const Simple = styled.div`
  width: 100%;
`;

const Interpolation = styled.div`
  content: "https://test.com/${props => props.endpoint}";
`;

const SpecialCharacters = styled.div`
  content: "  ${props => props.text}  ";\n color: red;
`;

const Comment = styled.div`
  width: 100%;
  // comment
  color: red;
`;

const Parens = styled.div`
  &:hover {
    color: blue;
  }
  color: red;
`;

const UrlComments = styled.div`
  color: red;
  /* // */
  background: red;
  /* comment 1 */
  /* comment 2 */
  // comment 3
  border: 1px solid green;
`;
