import React from "react";
import { Alert, Illustration } from "@kiwicom/orbit-components";

export default function Home() {
  return (
    <React.Fragment>
      <Alert type="success" spaceAfter="large">
        It Works!
      </Alert>
      <Illustration name="Success" />
    </React.Fragment>
  );
}
