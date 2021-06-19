import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import Main from "../Main";

describe("COMPONENT Main", () => {
  test("WILL RENDER", () => {
    let root: ReactTestRenderer;

    act(() => {
      root = create(<Main />);
    });

    expect(root.toJSON()).toMatchSnapshot();
  });
});
