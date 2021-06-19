import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
import Footer from "../Footer";

describe("COMPONENT Footer", () => {
  test("WILL RENDER", () => {
    let root: ReactTestRenderer;

    act(() => {
      root = create(<Footer />);
    });

    expect(root.toJSON()).toMatchSnapshot();
  });
});
