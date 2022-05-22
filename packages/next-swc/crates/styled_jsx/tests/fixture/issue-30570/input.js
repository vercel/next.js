export default function IndexPage() {
    return (
      <div>
        <h1>Hello World.</h1>

        <style jsx global>{`
          @supports (display: flex) {
            h1 {
              color: hotpink;
            }
          }
        `}</style>
      </div>
    );
  }