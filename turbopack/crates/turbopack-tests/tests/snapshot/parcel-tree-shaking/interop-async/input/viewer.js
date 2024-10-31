export default import("./client.js").then((c) => [
	c.default,
	Buffer.from("viewer"),
]);
