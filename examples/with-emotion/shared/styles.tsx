import { css, Global, keyframes, Keyframes } from "@emotion/react";
import styled from "@emotion/styled";

export const globalStyles = (
  <Global
    styles={css`
      html,
      body {
        padding: 3rem 1rem;
        margin: 0;
        background: papayawhip;
        min-height: 100%;
        font-family: Helvetica, Arial, sans-serif;
        font-size: 24px;
      }
    `}
  />
);

export const basicStyles = css({
  backgroundColor: "white",
  color: "cornflowerblue",
  border: "1px solid lightgreen",
  borderRight: "none",
  borderBottom: "none",
  boxShadow: "5px 5px 0 0 lightgreen, 10px 10px 0 0 lightyellow",
  transition: "all 0.1s linear",
  margin: "3rem 0",
  padding: "1rem 0.5rem",
});

export const hoverStyles = css`
  &:hover {
    color: white;
    background-color: lightgray;
    border-color: aqua;
    box-shadow: -15px -15px 0 0 aqua, -30px -30px 0 0 cornflowerblue;
  }
`;
export const bounce = keyframes`
  from {
    transform: scale(1.01);
  }
  to {
    transform: scale(0.99);
  }
`;

export const Basic = styled.div`
  ${basicStyles};
`;

export const Combined = styled.div`
  ${basicStyles};
  ${hoverStyles};
  & code {
    background-color: linen;
  }
`;

export const Pink = styled(Basic)({
  color: "hotpink",
});

export const BasicExtended = styled(Basic, {
  shouldForwardProp: (propertyName: string) => !propertyName.startsWith("$"),
})``;

export const ComponentSelectorsExtended = styled.div`
  ${BasicExtended} {
    color: green;
  }
  box-shadow: -5px -5px 0 0 green;
`;

export const Animated = styled.div<{ animation: Keyframes }>`
  ${basicStyles};
  ${hoverStyles};
  & code {
    background-color: linen;
  }
  animation: ${({ animation }) => animation} 0.2s infinite ease-in-out alternate;
`;
