export default function transform(file, api, options) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let dirtyFlag = false;

  // Find the import declaration with the specific source
  root.find(j.ImportDeclaration, { source: { value: '@next/font/google' } })
    .forEach(path => {
      // Update the source value
      path.node.source.value = 'next/font/google';
      dirtyFlag = true;
    });

  return dirtyFlag ? root.toSource() : undefined;
}