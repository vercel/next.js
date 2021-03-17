import { convertPascalToKebabCase } from './utils'
const path = require('path')
const userComponentsPath = path.resolve('./components')
const libComponentsPath = path.resolve('./lib/components')

//Bug: when dynamic imports are used within the module, it doest not get outputted server-side
//let AgilityModule = dynamic(() => import ('../components/' + m.moduleName));

export const requireComponentDependancyByName = (name) => {
  let pascalCaseName = name
  let kebabCaseName = convertPascalToKebabCase(name)
  let Component = null

  try {
    Component = requireComponent(kebabCaseName)
  } catch {}

  if (!Component) {
    try {
      Component = requireComponent(pascalCaseName)
    } catch {}
  }

  if (!Component) {
    // eslint-disable-next-line no-throw-literal
    throw `Could not find a component with the name ${name}. Tried searching:
        ${userComponentsPath}/${kebabCaseName}.js',
        ${libComponentsPath}/${kebabCaseName}.js',
        ${userComponentsPath}/${pascalCaseName}.js',
        ${libComponentsPath}/${pascalCaseName}.js'.`
  }

  return Component
}

const requireComponent = (name) => {
  let Component = null

  try {
    //check the user path first (must be relative paths)
    Component = require(`../components/${name}.js`).default
  } catch {}

  if (!Component)
    try {
      //fallback to lib path (must be relative paths)
      Component = require(`./components/${name}.js`).default
    } catch {}

  return Component
}
