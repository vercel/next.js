import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NavLinks from "./nav-links";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

test("App Router: Works with mocked next/navigation", () => {
  render(<NavLinks />);

  const homeLink = screen.getByRole("link", { name: "Home" });
  const aboutLink = screen.getByRole("link", { name: "About" });

  expect(homeLink).toHaveProperty("className", "active");
  expect(aboutLink).toHaveProperty("className", "");
});
