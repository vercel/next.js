import hello from "../hello";
import { createMocks } from "node-mocks-http";
import { NextApiRequest, NextApiResponse } from "next";

describe("API /hello", () => {
  test("runs", () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      path: "/hello",
    });
    
    hello(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({
        name: "John Doe",
      })
    );
  });
});
