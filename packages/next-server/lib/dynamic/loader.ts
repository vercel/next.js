export type Component<P> = React.ComponentType<P> | { default: React.ComponentType<P> }

async function load<P extends {}>(loader: () => Promise<Component<P>>): Promise<Component<P>> {
    return loader()
}

export default load
