const { singleAssignBool } = { singleAssignBool: true };

let { objPatternBool } = { objPatternBool: true };
({ objPatternBool } = { objPatternBool: false });

let [ arrPatternBool ] = [ true ];
[arrPatternBool] = [false];

let [{inner: [ nestedPatternBool ]}] = [{inner: [ true ]}];
[{inner: [ nestedPatternBool ]}] = [{inner: [ false ]}];
