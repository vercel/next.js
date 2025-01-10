/// The control flow of visiting an edge during a graph traversal.
pub enum VisitControlFlow<Node, Abort = !> {
    /// The traversal should continue on the outgoing edges of the given node.
    Continue(Node),
    /// The traversal should skip visiting the edges the given node.
    Skip(Node),
    /// The traversal should abort and return immediately.
    Abort(Abort),
}

impl<Node, Abort> VisitControlFlow<Node, Abort> {
    /// Map the continue and skip values of this control flow.
    pub fn map_node<Map, Mapped>(self, mut map: Map) -> VisitControlFlow<Mapped, Abort>
    where
        Map: FnMut(Node) -> Mapped,
    {
        match self {
            VisitControlFlow::Continue(node) => VisitControlFlow::Continue(map(node)),
            VisitControlFlow::Skip(node) => VisitControlFlow::Skip(map(node)),
            VisitControlFlow::Abort(abort) => VisitControlFlow::Abort(abort),
        }
    }

    /// Map the abort value of this control flow.
    pub fn map_abort<Map, Mapped>(self, mut map: Map) -> VisitControlFlow<Node, Mapped>
    where
        Map: FnMut(Abort) -> Mapped,
    {
        match self {
            VisitControlFlow::Continue(node) => VisitControlFlow::Continue(node),
            VisitControlFlow::Skip(node) => VisitControlFlow::Skip(node),
            VisitControlFlow::Abort(abort) => VisitControlFlow::Abort(map(abort)),
        }
    }
}
