import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import Header from "../Head";

describe("COMPONENT Header", () => {
  test("WILL RENDER", () => {
    let root: ReactTestRenderer;

    act(() => {
      root = create(<Header />);
    });

    expect(root.toJSON()).toMatchSnapshot();
  });
});
