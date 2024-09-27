"use client";

const backgroundColor = "#eee";
const hoverColor = "red";

export default function Home() {
  return (
    <div className="hello">
      <p>Hello World</p>
      <style jsx>{`
        .hello {
          background-color: ${backgroundColor};
          padding: 100px;
          text-align: center;
          transition: background 100ms ease-in;
        }

        .hello:hover {
          color: ${hoverColor};
        }

        @media only screen and (max-width: 480px) {
          .hello {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}
