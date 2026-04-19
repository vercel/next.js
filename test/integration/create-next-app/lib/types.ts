import {
  TemplateMode,
  TemplateType,
} from '../../../../packages/create-next-app/templates'

export interface DefaultTemplateOptions {
  cwd: string
  projectName: string
}

export interface CustomTemplateOptions extends DefaultTemplateOptions {
  mode: TemplateMode
  template: TemplateType
  srcDir?: boolean
}

export interface ProjectFiles extends DefaultTemplateOptions {
  files: string[]
}

export interface ProjectDeps extends DefaultTemplateOptions {
  type: 'dependencies' | 'devDependencies'
  deps: string[]
}
