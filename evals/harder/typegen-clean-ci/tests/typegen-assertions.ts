declare const page: PageProps<'/blog/[slug]'>
declare const layout: LayoutProps<'/dashboard'>
declare const route: RouteContext<'/api/articles/[id]'>

page.params.then((params) => params.slug satisfies string)
layout.params.then((params) => params satisfies Record<string, never>)
route.params.then((params) => params.id satisfies string)
