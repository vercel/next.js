import NextjsRouting from '../../pages/nextjsRouting'

export default {
  title: 'Pages',
  component: NextjsRouting,
}

export const NextjsRoutingPage = {
  parameters: {
    nextjs: {
      router: {
        route: 'this-is-a-story-override',
      },
    },
  },
}
