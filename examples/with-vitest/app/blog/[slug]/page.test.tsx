import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

test("App Router: Works with async Server Components", async () => {
  const params = Promise.resolve({ slug: "Test" });
  const searchParams = Promise.resolve({});
  render(await Page({ params, searchParams }));
  expect(
    screen.getByRole("heading", { level: 1, name: "Slug: Test" }),
  ).toBeDefined();
});
