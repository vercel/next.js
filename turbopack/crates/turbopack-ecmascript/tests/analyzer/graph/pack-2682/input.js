const BuggyArguments = ({ variable }) => {
  if (Math.random() > 1) {
    // this will never execute because Math.random() > 1 will never be true but
    // for turbopack this should appear as a condition that could execute sometimes

    variable = "true";
  }

  return JSON.stringify({
    condition: variable === "true",
    buggedConditionalCheck: variable === "true" ? "true" : "false",
  });
};

const res = BuggyArguments({ variable: "false" });
