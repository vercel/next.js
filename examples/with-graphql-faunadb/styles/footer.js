import css from 'styled-jsx/css'

export const footer = css.resolve`
  flex-grow: 1;
  flex-shrink: 0;
  flex-basis: 140px;
  width: 100%;
  background-color: rgba(50, 63, 203);
  padding-top: 20px;
  padding-bottom: 20px;
  display: flex;
  flex-direction: row;
  align-items: center;
`

export const footerContent = css.resolve`
  div {
    margin: auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    color: white !important;
    max-width: 800px;
    width: 100%;
  }
`

export const footerColumn = css.resolve`
  div {
    flex-basis: 25%;
    padding-left: 70px;
  }
`
export const footerColumnFirst = css.resolve`
  div {
    font-size: 60% !important;
  }
`
export const footerColumnFirstURL = css.resolve`
  a {
    color: white !important;
  }
`
export const footerColumnList = css.resolve`
  ul {
    list-style-type: none;
    padding: 0;
  }
`
export const footerColumnListURL = css.resolve`
  a {
    color: white;
    text-decoration: none;
    transition: color 200ms ease-in-out;
    color: rgba(255, 255, 255, 0.5);
  }
  a:hover {
    color: white;
  }
`
