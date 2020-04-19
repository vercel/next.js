import React from "react"
import { render, fireEvent } from "../../test/testUtils"
import { Home } from "../index"

describe("Home page", () => {
  it("matches snapshot", () => {
    const { getByText } = render(<Home />, {})
    window.alert = jest.fn()
    fireEvent.click(getByText("Test Button"))
    expect(window.alert).toHaveBeenCalledWith("With typescript and Jest")
  })

  it("clicking button triggers alert", () => {
    const { asFragment } = render(<Home />, {})
    expect(asFragment()).toMatchSnapshot()
  })
})
