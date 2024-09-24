const backgroundColor = "#eee";

export default function Home() {
  return (
    <div className="hello">
      <p>Hello World</p>
      <style jsx>{`
        $color: red;

        .hello {
          background-color: ${backgroundColor};
          padding: 100px;
          text-align: center;
          transition: 100ms ease-in background;
          &:hover {
            color: $color;
          }

          @media only screen and (max-width: 480px) {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}
