const fs = require("fs");

// Define the path to the generated file
const generatedFilePath = "gql/gql.ts";

// Read the existing content of the file
fs.readFile(generatedFilePath, "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  // Add "// @ts-nocheck" at the beginning of the file content
  const updatedContent = `// @ts-nocheck\n${data}`;

  // Write the updated content back to the file
  fs.writeFile(generatedFilePath, updatedContent, "utf8", (err) => {
    if (err) {
      console.error("Error writing file:", err);
    } else {
      console.log(`Added "// @ts-nocheck" to ${generatedFilePath}`);
    }
  });
});
