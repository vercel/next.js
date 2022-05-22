import styled from 'styled-components'


// For index.tsx

export const Container = styled.div`
display:flex;
flex-direction:column;
text-align: center;
justify-content: center;
min-height: 100vh;
padding-top: 0.5rem;
padding-bottom: 0.5rem;
`
export const Main = styled.main`
display:flex;
flex-direction:column;
align-items: center;
text-align: center;
justify-content: center;
width: 100%;
flex: 1 1 0%;
padding-left: 5rem;
padding-right: 5rem;
`

export const Title = styled.h1`
font-size: 3.75rem;
line-height: 1;
font-weight: 700;
`
export const TitleLink = styled.a`
color: rgb(37 99 235);
`
export const Description = styled.p`
margin-top: 0.5rem;
font-size: 1.5rem;
line-height: 2rem;
`

export const Code = styled.code`
padding: 0.75rem;
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
font-size: 1.125rem;
    line-height: 1.75rem;
    background-color: rgb(243 244 246 /1 );
    border-radius: 0.375rem;
`

export const Grid = styled.div`

display:flex;
flex-wrap: wrap;
align-items: center;
justify-content: space-around;
max-width: 56rem;
margin-top: 1.5rem;

@media (min-width: 640px) {

   width: 100%;
  
}

`

export const Card = styled.a`
padding: 1.5rem/* 24px */;
margin-top: 1.5rem;
text-align: left;
border-width: 1px;
width: 24rem;
border-radius: 0.75rem;
&:hover {
  color: rgb(37 99 235);
}
`

export const CardTitle = styled.h3`

font-size: 1.5rem;
line-height: 2rem;
font-weight: 700;

`

export const CardDetail = styled.p`
margin-top: 1rem;
font-size: 1.25rem;
line-height: 1.75rem;

`

export const Footer = styled.footer`
display:flex;
align-items: center;
justify-content: center;
width:100%;
height: 6rem;
border-top-width: 1px;

`

export const FooterLink = styled.a`
display:flex;
align-items: center;
justify-content:center;

`

export const FooterImage = styled.img`
height:1rem;
margin-left:;

`
