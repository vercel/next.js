const fs = require("fs");

const generatedFilePath = "src/gql/gql.ts";

fs.readFile(generatedFilePath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  const updatedContent = `// @ts-nocheck\n${data}`;

  fs.writeFile(generatedFilePath, updatedContent, "utf8", (err) => {
    if (err) {
      console.error("Error writing file:", err);
    } else {
      console.log(`Added "// @ts-nocheck" to ${generatedFilePath}`);
    }
  });
});
