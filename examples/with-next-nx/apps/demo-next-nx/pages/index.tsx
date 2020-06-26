import React from 'react';

import './index.css';

import { ReactComponent as NxLogo } from '../public/nx-logo-white.svg';

export const Index = () => {
  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./${fileName}.${style} file.
   */
  return (
    <div className="app">
      <header className="flex">
        <NxLogo alt="" width="75" height="50" />
        <h1>Welcome to demo-next-nx!</h1>
      </header>
      <main>
        <h2>Resources &amp; Tools</h2>
        <p>Thank you for using and showing some ♥ for Nx.</p>
        <div className="flex github-star-container">
          <a
            href="https://github.com/nrwl/nx"
            target="_blank"
            rel="noopener noreferrer"
          >
            {' '}
            If you like Nx, please give it a star:
            <div className="github-star-badge">
              <img src="/star.svg" className="material-icons" alt="" />
              Star
            </div>
          </a>
        </div>
        <p>Here are some links to help you get started.</p>
        <ul className="resources">
          <li className="col-span-2">
            <a
              className="resource flex"
              href="https://connect.nrwl.io/app/courses/nx-workspaces/intro"
            >
              Nx video course
            </a>
          </li>
          <li className="col-span-2">
            <a
              className="resource flex"
              href="https://nx.dev/react/getting-started/what-is-nx"
            >
              Nx video tutorial
            </a>
          </li>
          <li className="col-span-2">
            <a
              className="resource flex"
              href="https://nx.dev/react/tutorial/01-create-application"
            >
              Interactive tutorial
            </a>
          </li>
          <li className="col-span-2">
            <a className="resource flex" href="https://connect.nrwl.io/">
              <img
                height="36"
                alt="Nrwl Connect"
                src="https://connect.nrwl.io/assets/img/CONNECT_ColorIcon.png"
              />
              <span className="gutter-left">Nrwl Connect</span>
            </a>
          </li>
        </ul>
        <h2>Next Steps</h2>
        <p>Here are some things you can do with Nx.</p>
        <details open>
          <summary>Add UI library</summary>
          <pre>{`# Generate UI lib
nx g @nrwl/react:lib ui

# Add a component
nx g @nrwl/react:component xyz --project ui`}</pre>
        </details>
        <details>
          <summary>View dependency graph</summary>
          <pre>{`nx dep-graph`}</pre>
        </details>
        <details>
          <summary>Run affected commands</summary>
          <pre>{`# see what's been affected by changes
nx affected:dep-graph

# run tests for current changes
nx affected:test

# run e2e tests for current changes
nx affected:e2e
`}</pre>
        </details>
      </main>
    </div>
  );
};

export default Index;
