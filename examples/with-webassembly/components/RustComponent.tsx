export async function RustServerComponent({ number }: { number: number }) {
  const exports = await import("../add.wasm");
  const { add_one: addOne } = exports;

  return <>{addOne(number)}</>;
}
