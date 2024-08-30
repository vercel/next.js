export default function transform(file, api, options) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let dirtyFlag = false;

  // Find the variable declaration for nextConfig
  root.find(j.VariableDeclarator, { id: { name: 'nextConfig' } }).forEach(path => {
    const init = path.node.init;

    // Ensure the initializer is an object expression
    if (j.ObjectExpression.check(init)) {
      // Check if experimental property already exists
      const experimentalProp = init.properties.find(prop =>
        j.Property.check(prop) && j.Identifier.check(prop.key) && prop.key.name === 'experimental'
      );

      if (!experimentalProp) {
        // Create the new experimental property
        const experimentalProperty = j.property.from({
          kind: 'init',
          key: j.identifier('experimental'),
          value: j.objectExpression([
            j.property.from({
              kind: 'init',
              key: j.identifier('staleTimes'),
              value: j.objectExpression([
                j.property.from({
                  kind: 'init',
                  key: j.identifier('dynamic'),
                  value: j.literal(30)
                }),
                j.property.from({
                  kind: 'init',
                  key: j.identifier('static'),
                  value: j.literal(180)
                })
              ])
            })
          ])
        });

        // Add the new property to the object
        init.properties.push(experimentalProperty);
        dirtyFlag = true;
      }
    }
  });

  return dirtyFlag ? root.toSource() : undefined;
}