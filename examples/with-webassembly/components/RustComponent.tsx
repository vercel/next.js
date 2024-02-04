import type { AddModuleExports } from "../wasm";
import dynamic from "next/dynamic";

interface RustComponentProps {
  number: Number;
}

const RustComponent = dynamic({
  loader: async () => {
    // Import the wasm module
    // @ts-ignore
    const exports = (await import("../add.wasm")) as AddModuleExports;
    const { add_one: addOne } = exports;

    // Return a React component that calls the add_one method on the wasm module
    return ({ number }: RustComponentProps) => (
      <div>
        <>{addOne(number)}</>
      </div>
    );
  },
});

export default RustComponent;
