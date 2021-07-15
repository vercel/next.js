import styled from "styled-components";

export const ThemeSwitch = styled.button`
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 5px 10px;
    background: none;
    border: 1px solid ${p => p.theme.text};
    color: ${p => p.theme.text};
`;
