import React from "react";
import { SampleComponent } from "../components/SampleComponent";

class OtherPage extends React.Component {
  public render() {
    return (
      <SampleComponent title={"Other Page"} linkTo="/" />
    );
  }
}

export default OtherPage;
