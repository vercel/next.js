import React from "react";
import TestRenderer from "react-test-renderer";

describe("styled-jsx", () => {
  it("compiles away <style jsx>", () => {
    const test = TestRenderer.create(
      <>
        <span>This should be color: red</span>
        <style jsx>{`
          span {
            color: red;
          }
        `}</style>
      </>
    );

    expect(test.toJSON()).toMatchObject({
      children: ["This should be color: red"],
      props: {
        className: /jsx\-[0-9a-f]+/,
      },
      type: "span",
    });
  });
});
