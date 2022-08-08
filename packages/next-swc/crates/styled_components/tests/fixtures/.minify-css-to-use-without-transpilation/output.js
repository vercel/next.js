import styled from 'styled-components';
const Simple = styled.div`width:100%;`;
const Interpolation = styled.div`content:"https://test.com/${props => props.endpoint}";`;
const SpecialCharacters = styled.div`content:"  ${props => props.text}  ";color:red;`;
const Comment = styled.div`width:100%;color:red;`;
const Parens = styled.div`&:hover{color:blue;}color:red;`;
const UrlComments = styled.div`color:red;background:red;border:1px solid green;`;
