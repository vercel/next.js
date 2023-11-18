import Image from 'next/image'
import hooks from '@/util/css-hooks'

export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6rem',
      }}
    >
      <div
        style={hooks({
          zIndex: 10,
          maxWidth: '64rem',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          large: {
            display: 'flex',
          },
        })}
      >
        <p
          style={hooks({
            margin: 0,
            position: 'fixed',
            left: 0,
            top: 0,
            display: 'flex',
            width: '100%',
            justifyContent: 'center',
            borderWidth: 0,
            borderStyle: 'solid',
            borderColor: 'rgb(209, 213, 219)',
            borderBottomWidth: 1,
            backgroundImage:
              'linear-gradient(rgb(228, 228, 231), rgba(228, 228, 231, 0))',
            paddingBottom: '1.5rem',
            paddingTop: '2rem',
            backdropFilter: 'blur(40px)',
            dark: {
              borderColor: 'rgb(38, 38, 38)',
              backgroundColor: 'rgba(39, 39, 42, 0.3)',
              backgroundImage: 'none',
            },
            large: {
              position: 'static',
              width: 'auto',
              borderRadius: '0.75rem',
              borderWidth: 1,
              backgroundColor: 'rgb(229, 231, 235)',
              paddingTop: '1rem',
              paddingRight: '1rem',
              paddingBottom: '1rem',
              paddingLeft: '1rem',
              dark: {
                backgroundColor: 'rgba(39, 39, 42, 0.3)',
              },
            },
          })}
        >
          Get started by editing&nbsp;
          <code
            style={{
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontWeight: 700,
            }}
          >
            src/app/page.tsx
          </code>
        </p>
        <div
          style={hooks({
            position: 'fixed',
            bottom: 0,
            left: 0,
            display: 'flex',
            height: '12rem',
            width: '100%',
            alignItems: 'flex-end',
            justifyContent: 'center',
            large: {
              position: 'static',
              height: 'auto',
              width: 'auto',
            },
          })}
        >
          <a
            style={hooks({
              textDecoration: 'inherit',
              color: 'inherit',
              pointerEvents: 'none',
              display: 'flex',
              placeItems: 'center',
              gap: '0.5rem',
              padding: '2rem',
              large: {
                pointerEvents: 'auto',
                padding: 0,
              },
            })}
            href="https://vercel.com?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            By{' '}
            <Image
              src="/vercel.svg"
              alt="Vercel Logo"
              style={hooks({
                dark: {
                  filter:
                    'invert(1) drop-shadow(rgba(255, 255, 255, 0.44) 0px 0px 4.8px)',
                },
              })}
              width={100}
              height={24}
              priority
            />
          </a>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          placeItems: 'center',
          zIndex: -1,
        }}
      >
        <span
          style={hooks({
            position: 'absolute',
            height: 300,
            width: 480,
            transform: 'matrix(1, 0, 0, 1, -240, 0)',
            borderRadius: 999,
            backgroundImage:
              'radial-gradient(rgb(255, 255, 255), rgba(0, 0, 0, 0))',
            filter: 'blur(40px)',
            large: {
              height: 360,
            },
            dark: {
              backgroundImage:
                'linear-gradient(to right bottom, rgba(0, 0, 0, 0), rgb(29, 78, 216))',
              opacity: 0.1,
            },
          })}
        />
        <Image
          style={hooks({
            position: 'relative',
            dark: {
              filter:
                'invert(1) drop-shadow(rgba(255, 255, 255, 0.44) 0px 0px 4.8px)',
            },
          })}
          src="/next.svg"
          alt="Next.js Logo"
          width={180}
          height={37}
          priority
        />
        <span
          style={hooks({
            position: 'absolute',
            zIndex: -20,
            height: 180,
            width: 240,
            transform: 'matrix(1, 0, 0, 1, 80, 0)',
            backgroundImage:
              'conic-gradient(from 180deg at 50% 50%, rgb(186, 230, 253), rgb(191, 219, 254), rgba(191, 219, 254, 0))',
            filter: 'blur(40px)',
            dark: {
              backgroundImage:
                'conic-gradient(from 180deg at 50% 50%, rgb(12, 74, 110), rgb(1, 65, 255), rgba(1, 65, 255, 0))',
              opacity: 0.4,
            },
          })}
        />
      </div>

      <div
        style={hooks({
          marginBottom: '8rem',
          display: 'grid',
          textAlign: 'center',
          large: {
            maxWidth: '64rem',
            width: '100%',
            marginBottom: 0,
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            textAlign: 'left',
          },
        })}
      >
        <a
          href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="group"
          style={hooks({
            textDecoration: 'inherit',
            color: 'inherit',
            borderRadius: '0.5rem',
            borderWidth: 1,
            borderColor: 'transparent',
            padding: '1rem 1.25rem',
            transitionProperty: 'background-color, border-color',
            transitionDuration: '150ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            hover: {
              borderColor: '#d5d1db',
              backgroundColor: '#F3F4F6',
              dark: {
                borderColor: '#404040',
                backgroundColor: 'rgb(38 38 38 / 0.3)',
              },
            },
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2
            style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.5rem',
              lineHeight: '2rem',
              fontWeight: 600,
            }}
          >
            Docs{' '}
            <span
              style={hooks({
                display: 'inline-block',
                transitionProperty: 'transform',
                transitionDuration: '150ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                groupHover: {
                  transform: 'translateX(0.25rem)',
                },
                motionReduce: {
                  transform: 'none',
                },
              })}
            >
              -&gt;
            </span>
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: '30ch',
              fontSize: '0.875rem',
              lineHeight: '1.25rem',
              opacity: 0.5,
            }}
          >
            Find in-depth information about Next.js features and API.
          </p>
        </a>

        <a
          href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
          className="group"
          style={hooks({
            textDecoration: 'inherit',
            color: 'inherit',
            borderRadius: '0.5rem',
            borderWidth: 1,
            borderColor: 'transparent',
            padding: '1rem 1.25rem',
            transitionProperty: 'background-color, border-color',
            transitionDuration: '150ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            hover: {
              borderColor: '#d5d1db',
              backgroundColor: '#F3F4F6',
              dark: {
                borderColor: '#404040',
                backgroundColor: 'rgb(38 38 38 / 0.3)',
              },
            },
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2
            style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.5rem',
              lineHeight: '2rem',
              fontWeight: 600,
            }}
          >
            Learn{' '}
            <span
              style={hooks({
                display: 'inline-block',
                transitionProperty: 'transform',
                transitionDuration: '150ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                groupHover: {
                  transform: 'translateX(0.25rem)',
                },
                motionReduce: {
                  transform: 'none',
                },
              })}
            >
              -&gt;
            </span>
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: '30ch',
              fontSize: '0.875rem',
              lineHeight: '1.25rem',
              opacity: 0.5,
            }}
          >
            Learn about Next.js in an interactive course with&nbsp;quizzes!
          </p>
        </a>

        <a
          href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="group"
          style={hooks({
            textDecoration: 'inherit',
            color: 'inherit',
            borderRadius: '0.5rem',
            borderWidth: 1,
            borderColor: 'transparent',
            padding: '1rem 1.25rem',
            transitionProperty: 'background-color, border-color',
            transitionDuration: '150ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            hover: {
              borderColor: '#d5d1db',
              backgroundColor: '#F3F4F6',
              dark: {
                borderColor: '#404040',
                backgroundColor: 'rgb(38 38 38 / 0.3)',
              },
            },
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2
            style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.5rem',
              lineHeight: '2rem',
              fontWeight: 600,
            }}
          >
            Templates{' '}
            <span
              style={hooks({
                display: 'inline-block',
                transitionProperty: 'transform',
                transitionDuration: '150ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                groupHover: {
                  transform: 'translateX(0.25rem)',
                },
                motionReduce: {
                  transform: 'none',
                },
              })}
            >
              -&gt;
            </span>
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: '30ch',
              fontSize: '0.875rem',
              lineHeight: '1.25rem',
              opacity: 0.5,
            }}
          >
            Explore the Next.js 13 playground.
          </p>
        </a>

        <a
          href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template&utm_campaign=create-next-app"
          className="group"
          style={hooks({
            textDecoration: 'inherit',
            color: 'inherit',
            borderRadius: '0.5rem',
            borderWidth: 1,
            borderColor: 'transparent',
            padding: '1rem 1.25rem',
            transitionProperty: 'background-color, border-color',
            transitionDuration: '150ms',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            hover: {
              borderColor: '#d5d1db',
              backgroundColor: '#F3F4F6',
              dark: {
                borderColor: '#404040',
                backgroundColor: 'rgb(38 38 38 / 0.3)',
              },
            },
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          <h2
            style={{
              margin: 0,
              marginBottom: '0.75rem',
              fontSize: '1.5rem',
              lineHeight: '2rem',
              fontWeight: 600,
            }}
          >
            Deploy{' '}
            <span
              style={hooks({
                display: 'inline-block',
                transitionProperty: 'transform',
                transitionDuration: '150ms',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                groupHover: {
                  transform: 'translateX(0.25rem)',
                },
                motionReduce: {
                  transform: 'none',
                },
              })}
            >
              -&gt;
            </span>
          </h2>
          <p
            style={{
              margin: 0,
              maxWidth: '30ch',
              fontSize: '0.875rem',
              lineHeight: '1.25rem',
              opacity: 0.5,
            }}
          >
            Instantly deploy your Next.js site to a shareable URL with Vercel.
          </p>
        </a>
      </div>
    </main>
  )
}
