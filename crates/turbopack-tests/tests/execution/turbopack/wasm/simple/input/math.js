import { add } from "./add.wasm";
import { factorial } from "./factorial.wasm";
import { fibonacci } from "./fibonacci.wasm";

export { add, factorial, fibonacci };

export function factorialJavascript(i) {
	if (i < 1) return 1;
	return i * factorialJavascript(i - 1);
}

export function fibonacciJavascript(i) {
	if (i < 2) return 1;
	return fibonacciJavascript(i - 1) + fibonacciJavascript(i - 2);
}
