import AboutComponent from "./components/about-component";
/* eslint-disable */
// Disable ESLint to prevent failing linting inside the Next.js repo.
// If you're using ESLint on your project, we recommend installing the ESLint Cypress plugin instead:
// https://github.com/cypress-io/eslint-plugin-cypress

// Cypress Component Test
describe("<AboutComponent />", () => {
  it("should render and display expected content in a Client Component", () => {
    // Mount the React component for the About page
    cy.mount(<AboutComponent />);

    // The new page should contain an h1 with "About page"
    cy.get("h1").contains("About Page");

    // Validate that a link with the expected URL is present
    // *Following* the link is better suited to an E2E test
    cy.get('a[href="/"]').should("be.visible");
  });
});

// Prevent TypeScript from reading file as legacy script
export {};
