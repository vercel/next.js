import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('next/jest', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'public/vercel.svg':
          '<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg"/>',
        'components/comp.js': `
          export default function Comp() {
            return <h1>Hello Dynamic</h1>;
          }
        `,
        'styles/index.module.css': '.home { color: orange }',
        'pages/index.js': `
          import dynamic from "next/dynamic";
          import Image from "next/image";
          import img from "../public/vercel.svg";
          import styles from "../styles/index.module.css";
          import localFont from "next/font/local";
          import { Inter } from "next/font/google";

          const inter = Inter({ subsets: ["latin"] });
          const myFont = localFont({ src: "./my-font.woff2" });

          const Comp = dynamic(() => import("../components/comp"), {
            loading: () => <h1>Loading...</h1>,
          });

          export default function Page() { 
            return <>
              <Comp />
              <Image src={img} alt="logo" placeholder="blur"/>
              <Image src={img} alt="logo 2"/>
              <p className={styles.home}>hello world</p>
              <p style={{ fontFamily: inter.style.fontFamily }} className={myFont.className}>hello world</p>
            </>
          } 
        `,
        'jest.config.js': `
          // jest.config.js
          const nextJest = require('next/jest')
          
          const createJestConfig = nextJest({
            // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
            dir: './',
          })
          
          // Add any custom config to be passed to Jest
          const customJestConfig = {
            // if using TypeScript with a baseUrl set to the root directory then you need the below for alias' to work
            moduleDirectories: ['node_modules', '<rootDir>/'],
            testEnvironment: 'jest-environment-jsdom',
            setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
            transform: {
              // Use babel-jest to transpile tests with the next/babel preset
              // https://jestjs.io/docs/configuration#transform-objectstring-pathtotransformer--pathtotransformer-object
              '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
            },
          }
          
          // createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
          module.exports = createJestConfig(customJestConfig)
        `,
        'jest.setup.js': `
          // Learn more: https://github.com/testing-library/jest-dom
          import '@testing-library/jest-dom/extend-expect'
        `,
        'test/dynamic.test.js': `
          import { render, screen, act } from "@testing-library/react";
          import Home from "../pages/index";
          
          describe("Home", () => {
            it("renders a heading", () => {
              act(() => {
                render(<Home />);
          
                const heading = screen.getByRole("heading", {
                  name: /Loading/i,
                });
          
                expect(heading).toBeInTheDocument();
              });
            });
          });
        `,
        'lib/hello.mjs': `
          import path from 'path'

          export default function hello() {
            return path.join('hello', 'world')
          }
        `,
        'test/mjs-support.test.js': `
          import path from 'path'
          import hello from '../lib/hello.mjs'
          
          it('should transpile .mjs file correctly', async () => {
            expect(hello()).toBe(path.join('hello', 'world'))
          })
        `,
        'test/mock.test.js': `
          import router from 'next/router'

          jest.mock('next/router', () => ({
            push: jest.fn(),
            back: jest.fn(),
            events: {
              on: jest.fn(),
              off: jest.fn(),
            },
            asPath: jest.fn().mockReturnThis(),
            beforePopState: jest.fn(() => null),
            useRouter: () => ({
              push: jest.fn(),
            }),
          }))

          it('call mocked', async () => {
            expect(router.push._isMockFunction).toBeTruthy()
          })
        `,
        'pages/my-font.woff2': 'fake font',
      },
      dependencies: {
        '@next/font': 'canary',
        jest: '27.4.7',
        '@testing-library/jest-dom': '5.16.1',
        '@testing-library/react': '12.1.2',
        '@testing-library/user-event': '13.5.0',
      },
      packageJson: {
        scripts: {
          // Runs jest and bails if jest fails
          build:
            'next build && yarn jest test/mock.test.js test/dynamic.test.js',
        },
      },
      buildCommand: `yarn build`,
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
