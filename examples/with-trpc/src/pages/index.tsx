import { trpc } from "../utils/trpc";

export default function IndexPage() {
  const hello = trpc.useQuery(["hello", { text: "client" }]);
  if (!hello.data) {
    return (
      <div style={styles}>
        <h1>Loading...</h1>
      </div>
    );
  }
  return (
    <div style={styles}>
      {/* the type is define, it can be autocompleted */}
      <h1>{hello.data.greeting}</h1>
    </div>
  );
}

const styles = {
  width: "100vw",
  height: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};
