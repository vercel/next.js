import Component from '../../../component'

export default async function Page(props: {
  params: Promise<Record<string, string | string[]>>
}) {
  return (
    <Component
      file="/[teamID]/sub/other-folder/page.tsx"
      params={props.params}
    />
  )
}
