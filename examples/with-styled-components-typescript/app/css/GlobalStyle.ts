import { createGlobalStyle } from "styled-components";
import { reset } from "./reset";

export const GlobalStyle = createGlobalStyle`
    ${reset};
  
    body {
        font-family: Helvetica, Arial, sans-serif;
        color: ${p => p.theme.text};
        background: ${p => p.theme.body};
    }
`;
