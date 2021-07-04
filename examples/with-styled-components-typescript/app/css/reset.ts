import { css } from "styled-components";

// Your custom reset here
export const reset = css`
    html {
        box-sizing: border-box;
    }

    * {
        padding: 0;
        margin: 0;
    }

    *,
    ::before,
    ::after {
        box-sizing: inherit;
    }

    button {
        cursor: pointer;
    }
`;
