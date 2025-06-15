import { convertPascalToKebabCase } from "./utils";
const path = require("path");
const userComponentsPath = path.resolve("./components");
const libComponentsPath = path.resolve("./lib/components");

const requireComponent = async (name) => {
  let Component = null;

  try {
    //check the user path first (must be relative paths)
    Component = (await import(`../components/${name}.tsx`)).default;
  } catch {}

  if (!Component)
    try {
      //fallback to lib path (must be relative paths)
      Component = (await import(`./components/${name}.tsx`)).default;
    } catch {}

  return Component;
};

//Bug: when dynamic imports are used within the module, it doest not get outputted server-side
//let AgilityModule = dynamic(() => import ('../components/' + m.moduleName));

export const requireComponentDependancyByName = async (name) => {
  let pascalCaseName = name;
  let kebabCaseName = convertPascalToKebabCase(name);
  let Component = null;

  try {
    Component = await requireComponent(kebabCaseName);
  } catch {}

  if (!Component) {
    try {
      Component = await requireComponent(pascalCaseName);
    } catch {}
  }

  if (!Component) {
    // eslint-disable-next-line no-throw-literal
    throw `Could not find a component with the name ${name}. Tried searching:
        ${userComponentsPath}/${kebabCaseName}.tsx',
        ${libComponentsPath}/${kebabCaseName}.tsx',
        ${userComponentsPath}/${pascalCaseName}.tsx',
        ${libComponentsPath}/${pascalCaseName}.tsx'.`;
  }

  return Component;
};
