import "@compiled/react";
import { BoxStyles } from "../components/class-names-box";
import { Button } from "../components/styled-button";
import { secondary, primary } from "../style/colors";

const IndexPage = () => (
  <BoxStyles>
    {(props) => (
      <div {...props}>
        <Button color={secondary}>Styled button</Button>

        <div
          css={{
            marginTop: 8,
            flexGrow: 1,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "sans-serif",
            color: primary,
            border: `1px solid ${primary}`,
          }}
        >
          CSS prop
        </div>
      </div>
    )}
  </BoxStyles>
);

export default IndexPage;
