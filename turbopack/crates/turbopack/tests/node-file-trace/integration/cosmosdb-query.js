const { default: query } = require("@zeit/cosmosdb-query");

const items = [{ id: "foo" }, { id: "bar" }];

const { result } = query("SELECT * FROM c WHERE c.id = @id").exec(items, {
  parameters: [{ name: "@id", value: "foo" }],
});
console.log(result);
