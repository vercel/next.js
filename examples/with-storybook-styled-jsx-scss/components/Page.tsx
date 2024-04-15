import React from "react";
import Link from "next/link";
import { Header } from "./Header";

export interface PageProps {
  user?: {};
  onLogin: () => void;
  onLogout: () => void;
  onCreateAccount: () => void;
}

export const Page: React.FC<PageProps> = ({
  user,
  onLogin,
  onLogout,
  onCreateAccount,
}) => (
  <>
    <article>
      <Header
        user={user}
        onLogin={onLogin}
        onLogout={onLogout}
        onCreateAccount={onCreateAccount}
      />
      <section>
        <h2>Example app with Storybook setup for SCSS in Styled-jsx</h2>
        <p>
          This example shows Styled-jsx (with SCSS) working for components
          rendered both inside and outside of Storybook.
        </p>
        <p>This example combines the following other examples:</p>
        <ul>
          <li>
            <Link
              href="https://github.com/vercel/next.js/tree/canary/examples/with-storybook"
              legacyBehavior
            >
              <a>with-storybook</a>
            </Link>
          </li>
          <li>
            <Link
              href="https://github.com/next.js/tree/canary/examples/with-styled-jsx-scss"
              legacyBehavior
            >
              <a>with-styled-jsx-scss</a>
            </Link>
          </li>
          <li>
            <Link
              href="https://github.com/next.js/tree/canary/examples/with-styled-jsx-scss"
              legacyBehavior
            >
              <a>with-typescript</a>
            </Link>
          </li>
        </ul>
        <p>
          Additionally, the Storybook demo components are moved into the
          components directory and their css is refactored into component level
          Styled JSX + SCSS.
        </p>
        <p>
          Story files live in their own directory and refer to the components
          within /components.
        </p>
        <p>
          The /styles directory contains styles, both global and for the
          index.js file.
        </p>
        <p>
          You might also want to check out the{" "}
          <Link
            href="https://github.com/vercel/styled-jsx#styles-outside-of-components"
            legacyBehavior
          >
            <a>Styled JSX documentation</a>
          </Link>
        </p>
        <p>
          <strong>
            <i>Improvements welcome!</i>
          </strong>
        </p>
      </section>
      <section>
        <h2>Pages in Storybook</h2>
        <p>
          <i>(From the storybook demo setup)</i>
        </p>
        <p>
          We recommend building UIs with a{" "}
          <a
            href="https://componentdriven.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong>component-driven</strong>
          </a>{" "}
          process starting with atomic components and ending with pages.
        </p>
        <p>
          Render pages with mock data. This makes it easy to build and review
          page states without needing to navigate to them in your app. Here are
          some handy patterns for managing page data in Storybook:
        </p>
        <ul>
          <li>
            Use a higher-level connected component. Storybook helps you compose
            such data from the "args" of child component stories
          </li>
          <li>
            Assemble data in the page component from your services. You can mock
            these services out using Storybook.
          </li>
        </ul>
        <p>
          Get a guided tutorial on component-driven development at{" "}
          <a
            href="https://www.learnstorybook.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn Storybook
          </a>
          . Read more in the{" "}
          <a
            href="https://storybook.js.org/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            docs
          </a>
          .
        </p>
        <div className="tip-wrapper">
          <span className="tip">Tip</span> Adjust the width of the canvas with
          the{" "}
          <svg
            width="10"
            height="10"
            viewBox="0 0 12 12"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g fill="none" fillRule="evenodd">
              <path
                d="M1.5 5.2h4.8c.3 0 .5.2.5.4v5.1c-.1.2-.3.3-.4.3H1.4a.5.5 0 01-.5-.4V5.7c0-.3.2-.5.5-.5zm0-2.1h6.9c.3 0 .5.2.5.4v7a.5.5 0 01-1 0V4H1.5a.5.5 0 010-1zm0-2.1h9c.3 0 .5.2.5.4v9.1a.5.5 0 01-1 0V2H1.5a.5.5 0 010-1zm4.3 5.2H2V10h3.8V6.2z"
                id="a"
                fill="#999"
              />
            </g>
          </svg>
          Viewports addon in the toolbar (when viewed in Storybook)
        </div>
      </section>
    </article>
    <style jsx>{`
      section {
        font-family: "Nunito Sans", "Helvetica Neue", Helvetica, Arial,
          sans-serif;
        font-size: 14px;
        line-height: 24px;
        padding: 48px 20px;
        margin: 0 auto;
        color: #333;
      }
      h2 {
        font-weight: 900;
        font-size: 32px;
        line-height: 1;
        margin: 0 0 4px;
        display: inline-block;
        vertical-align: top;
      }
      p {
        margin: 1em 0;
      }
      a {
        text-decoration: none;
        color: #1ea7fd;
      }
      ul {
        padding-left: 30px;
        margin: 1em 0;
      }
      li {
        margin-bottom: 8px;
      }
      .tip {
        display: inline-block;
        border-radius: 1em;
        font-size: 11px;
        line-height: 12px;
        font-weight: 700;
        background: #e7fdd8;
        color: #66bf3c;
        padding: 4px 12px;
        margin-right: 10px;
        vertical-align: top;
      }
      .tip-wrapper {
        font-size: 13px;
        line-height: 20px;
        margin-top: 40px;
        margin-bottom: 40px;

        svg {
          display: inline-block;
          height: 12px;
          width: 12px;
          margin-right: 4px;
          vertical-align: top;
          margin-top: 3px;

          path {
            fill: #1ea7fd;
          }
        }
      }
    `}</style>
  </>
);
