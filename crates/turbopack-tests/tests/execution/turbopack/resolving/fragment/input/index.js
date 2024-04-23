import client from "./client#component";
import nofrag from "./nofrag#frag";
import client2 from "./client#component.js";
import nofrag2 from "./nofrag.js#frag";

it("should resolve to a file with a fragment", () => {
  expect(client).toBe("client#component");
});

it("should resolve to a file without a fragment", () => {
  expect(nofrag).toBe("nofrag");
});

it("should resolve to a file with a fragment and an extension", () => {
  expect(client2).toBe("client#component");
});

it("should resolve to a file without a fragment but with an extension", () => {
  expect(nofrag2).toBe("nofrag");
});
