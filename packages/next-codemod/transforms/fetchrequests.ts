export default function transform(file, api, options) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let dirtyFlag = false;

  // Find the default export function declaration
  const defaultExport = root.find(j.ExportDefaultDeclaration);

  // If a default export function is found, insert the new export statement before it
  if (defaultExport.size() > 0) {
    defaultExport.insertBefore(
      j.exportNamedDeclaration(
        j.variableDeclaration('const', [
          j.variableDeclarator(
            j.identifier('fetchCache'),
            j.literal('default-cache')
          )
        ])
      )
    );
    dirtyFlag = true;
  }

  return dirtyFlag ? root.toSource() : undefined;
}