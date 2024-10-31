import { foo as old } from "./c";
export * from "./c";

function foo() {
	return "fooB" + old();
}

export { foo };
