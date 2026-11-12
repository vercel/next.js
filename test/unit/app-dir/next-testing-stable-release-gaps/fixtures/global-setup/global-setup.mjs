export default function setup(project) {
  project.provide('setupValue', 42)
  return () => {}
}
