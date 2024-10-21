"use client";

const backgroundColor = "#eee";
const hoverColor = "#ccc";

export default function Home() {
  return (
    <div className="hello">
      <p>Hello World</p>
      <style jsx>{`
        .hello {
          font:
            15px Helvetica,
            Arial,
            sans-serif;
          background: ${backgroundColor};
          padding: 100px;
          text-align: center;
          transition: 100ms ease-in background;
          lost-column: 1/3;
          &:hover {
            color: red;
          }
        }
        .hello:hover {
          background: ${hoverColor};
        }
      `}</style>
    </div>
  );
}