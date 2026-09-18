/* global describe, it */
import { render } from "@testing-library/react";
import expect from "expect.js";

import App from "../pages/index.js";

describe("With React Testing Library", () => {
  it('App shows "Hello world!"', () => {
    const app = render(<App />);

    expect(app.container.querySelector("p")?.textContent).to.equal(
      "Hello World!",
    );
  });
});
