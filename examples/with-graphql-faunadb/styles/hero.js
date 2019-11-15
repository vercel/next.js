import css from 'styled-jsx/css'

export const heroContainer = css.resolve`
  div {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
`

export const hero = css.resolve`
  div {
    width: 70%;
    max-width: 700px;
    text-align: center;
    flex-basis: 30%;
  }
`

export const heroForm = css.resolve`
  form {
    position: relative;
    display: block;
    margin-left: auto;
    margin-right: auto;
    text-align: left;
    width: 50%;
    margin-bottom: 60px;
  }
`

export const heroFormFieldset = css.resolve`
  fieldset {
    outline: none;
    border: none;
  }
`
export const heroFormTextArea = css.resolve`
  textarea {
    display: block;
    width: 100%;
    margin-bottom: 20px;
    resize: none;
    padding: 5px;
    border-radius: 5px;
    border: 1.2px solid rgba(50, 63, 203, 0.5);
    transition: border 200ms ease-in-out;
    box-sizing: border-box;
    font-family: sans-serif;
  }

  textarea:hover,
  textarea:focus {
    outline: none !important;
    border: 1.2px solid rgba(50, 63, 203);
  }
`
export const heroFormTwitterInput = css.resolve`
  input {
    display: inline-block;
    width: 45%;
    padding: 5px;
    border-radius: 5px;
    border: 1.2px solid rgba(50, 63, 203, 0.5);
    transition: border 200ms ease-in-out;
  }

  input:hover,
  input:focus {
    outline: none !important;
    border: 1.2px solid rgba(50, 63, 203);
  }
`
export const heroFormSubmitButton = css.resolve`
  input {
    width: 45%;
    border-radius: 5px;
    padding: 5px;
    float: right;
    background-color: rgba(50, 63, 203);
    color: white;
    font-weight: bold;
    border: 1.2px solid rgba(50, 63, 203, 0.5);
  }

  input:hover {
    cursor: pointer;
  }
`
export const heroEntries = css.resolve`
  div {
    flex-grow: 0;
    flex-shrink: 10;
    flex-basis: 60%;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    display: block;
    margin-left: auto;
    margin-right: auto;
    width: 56%;
    max-width: 800px;
    text-align: center;
  }

  div::-webkit-scrollbar {
    width: 2px;
  }

  div::-webkit-scrollbar-thumb {
    background: rgba(50, 63, 203, 0.5);
  }
`
