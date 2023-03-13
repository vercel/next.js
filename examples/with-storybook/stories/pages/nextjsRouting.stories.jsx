import NextjsRouting from '../../pages/nextjsRouting'

export default {
  title: 'Pages',
  component: NextjsRouting,
}

export const NextjsRoutingPage = () => <NextjsRouting />

NextjsRoutingPage.parameters = {
  nextRouter: {
    route: 'this-is-a-story-override',
  },
}
