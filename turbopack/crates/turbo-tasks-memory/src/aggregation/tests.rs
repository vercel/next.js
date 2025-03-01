use std::{
    fmt::Debug,
    hash::Hash,
    iter::once,
    ops::{ControlFlow, Deref, DerefMut},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
    time::Instant,
};

use parking_lot::{Mutex, MutexGuard};
use rand::{rngs::SmallRng, Rng, SeedableRng};
use ref_cast::RefCast;
use rstest::*;
use rustc_hash::FxHashSet;
use turbo_tasks::FxIndexSet;

use self::aggregation_data::prepare_aggregation_data;
use super::{
    aggregation_data, handle_new_edge, lost_edge::handle_lost_edges, AggregationContext,
    AggregationNode, AggregationNodeGuard, RootQuery,
};
use crate::aggregation::{query_root_info, PreparedOperation, StackVec};

fn find_root(mut node: NodeRef) -> NodeRef {
    loop {
        let lock = node.0.inner.lock();
        let uppers = lock.aggregation_node.uppers();
        if uppers.is_empty() {
            drop(lock);
            return node;
        }
        let upper = uppers.iter().next().unwrap().clone();
        drop(lock);
        node = upper;
    }
}

fn check_invariants(ctx: &NodeAggregationContext<'_>, node_ids: impl IntoIterator<Item = NodeRef>) {
    let mut queue = node_ids.into_iter().collect::<Vec<_>>();
    // print(ctx, &queue[0], true);
    #[allow(clippy::mutable_key_type, reason = "this is a test")]
    let mut visited = FxHashSet::default();
    while let Some(node_id) = queue.pop() {
        assert_eq!(node_id.0.atomic.load(Ordering::SeqCst), 0);
        let node = ctx.node(&node_id);
        for child_id in node.children() {
            if visited.insert(child_id.clone()) {
                queue.push(child_id.clone());
            }
        }

        let aggregation_number = node.aggregation_number();
        let node_value = node.guard.value;
        let uppers = match &*node {
            AggregationNode::Leaf { uppers, .. } => {
                let uppers = uppers.iter().cloned().collect::<StackVec<_>>();
                drop(node);
                uppers
            }
            AggregationNode::Aggegating(aggegrating) => {
                let uppers = aggegrating.uppers.iter().cloned().collect::<StackVec<_>>();
                let followers = aggegrating
                    .followers
                    .iter()
                    .cloned()
                    .collect::<StackVec<_>>();
                drop(node);
                for follower_id in followers {
                    let follower_aggregation_number;
                    let follower_uppers;
                    let follower_value;
                    {
                        let follower = ctx.node(&follower_id);

                        follower_aggregation_number = follower.aggregation_number();
                        follower_uppers =
                            follower.uppers().iter().cloned().collect::<StackVec<_>>();
                        follower_value = follower.guard.value;
                    }

                    // A follower should have a bigger aggregation number
                    let condition = follower_aggregation_number > aggregation_number
                        || aggregation_number == u32::MAX;
                    if !condition {
                        let msg = format!(
                            "follower #{} {} -> #{} {}",
                            node_value,
                            aggregation_number,
                            follower_value,
                            follower_aggregation_number
                        );
                        print(ctx, &find_root(node_id.clone()), true);
                        panic!("{msg}");
                    }

                    // All followers should also be connected to all uppers
                    let missing_uppers = uppers.iter().filter(|&upper_id| {
                        if follower_uppers
                            .iter()
                            .any(|follower_upper_id| follower_upper_id == upper_id)
                        {
                            return false;
                        }
                        let upper = ctx.node(upper_id);
                        if let Some(followers) = upper.followers() {
                            !followers
                                .iter()
                                .any(|follower_upper_id| follower_upper_id == &follower_id)
                        } else {
                            false
                        }
                    });
                    #[allow(clippy::never_loop)]
                    for missing_upper in missing_uppers {
                        let upper_value = {
                            let upper = ctx.node(missing_upper);
                            upper.guard.value
                        };
                        let msg = format!(
                            "follower #{} -> #{} is not connected to upper #{}",
                            node_value, follower_value, upper_value,
                        );
                        print(ctx, &find_root(node_id.clone()), true);
                        panic!("{msg}");
                    }

                    // And visit them too
                    if visited.insert(follower_id.clone()) {
                        queue.push(follower_id);
                    }
                }
                uppers
            }
        };
        for upper_id in uppers {
            {
                let upper = ctx.node(&upper_id);
                let upper_aggregation_number = upper.aggregation_number();
                let condition =
                    upper_aggregation_number > aggregation_number || aggregation_number == u32::MAX;
                if !condition {
                    let msg = format!(
                        "upper #{} {} -> #{} {}",
                        node_value, aggregation_number, upper.guard.value, upper_aggregation_number
                    );
                    drop(upper);
                    print(ctx, &find_root(upper_id.clone()), true);
                    panic!("{msg}");
                }
            }
            if visited.insert(upper_id.clone()) {
                queue.push(upper_id);
            }
        }
    }
}

fn print_graph<C: AggregationContext>(
    ctx: &C,
    entries: impl IntoIterator<Item = C::NodeRef>,
    show_internal: bool,
    name_fn: impl Fn(&C::NodeRef) -> String,
) {
    let mut queue = entries.into_iter().collect::<Vec<_>>();
    let mut visited = queue.iter().cloned().collect::<FxHashSet<_>>();
    while let Some(node_id) = queue.pop() {
        let name = name_fn(&node_id);
        let node = ctx.node(&node_id);
        let n = node.aggregation_number();
        let n = if n == u32::MAX {
            "♾".to_string()
        } else {
            n.to_string()
        };
        let color = if matches!(*node, AggregationNode::Leaf { .. }) {
            "gray"
        } else {
            "#99ff99"
        };
        let children = node.children().collect::<StackVec<_>>();
        let uppers = node.uppers().iter().cloned().collect::<StackVec<_>>();
        let followers = match &*node {
            AggregationNode::Aggegating(aggegrating) => aggegrating
                .followers
                .iter()
                .cloned()
                .collect::<StackVec<_>>(),
            AggregationNode::Leaf { .. } => StackVec::new(),
        };
        drop(node);

        if show_internal {
            println!(
                "\"{}\" [label=\"{}\\n{}\", style=filled, fillcolor=\"{}\"];",
                name, name, n, color
            );
        } else {
            println!(
                "\"{}\" [label=\"{}\\n{}\\n{}U {}F\", style=filled, fillcolor=\"{}\"];",
                name,
                name,
                n,
                uppers.len(),
                followers.len(),
                color,
            );
        }

        for child_id in children {
            let child_name = name_fn(&child_id);
            println!("\"{}\" -> \"{}\";", name, child_name);
            if visited.insert(child_id.clone()) {
                queue.push(child_id);
            }
        }
        if show_internal {
            for upper_id in uppers {
                let upper_name = name_fn(&upper_id);
                println!(
                    "\"{}\" -> \"{}\" [style=dashed, color=green];",
                    name, upper_name
                );
                if visited.insert(upper_id.clone()) {
                    queue.push(upper_id);
                }
            }
            for follower_id in followers {
                let follower_name = name_fn(&follower_id);
                println!(
                    "\"{}\" -> \"{}\" [style=dashed, color=red];",
                    name, follower_name
                );
                if visited.insert(follower_id.clone()) {
                    queue.push(follower_id);
                }
            }
        }
    }
}

struct Node {
    atomic: AtomicU32,
    inner: Mutex<NodeInner>,
}

impl Node {
    fn new(value: u32) -> Arc<Self> {
        Arc::new(Node {
            atomic: AtomicU32::new(0),
            inner: Mutex::new(NodeInner {
                children: Vec::new(),
                aggregation_node: AggregationNode::new(),
                value,
            }),
        })
    }

    fn new_with_children(
        aggregation_context: &NodeAggregationContext,
        value: u32,
        children: Vec<Arc<Node>>,
    ) -> Arc<Self> {
        let node = Self::new(value);
        for child in children {
            node.add_child(aggregation_context, child);
        }
        node
    }

    fn add_child(self: &Arc<Node>, aggregation_context: &NodeAggregationContext, child: Arc<Node>) {
        self.add_child_unchecked(aggregation_context, child);
        check_invariants(aggregation_context, once(find_root(NodeRef(self.clone()))));
    }

    fn add_child_unchecked(
        self: &Arc<Node>,
        aggregation_context: &NodeAggregationContext,
        child: Arc<Node>,
    ) {
        let mut guard = self.inner.lock();
        guard.children.push(child.clone());
        let number_of_children = guard.children.len();
        let mut guard = unsafe { NodeGuard::new(guard, self.clone()) };
        let prepared = handle_new_edge(
            aggregation_context,
            &mut guard,
            &NodeRef(self.clone()),
            &NodeRef(child),
            number_of_children,
        );
        drop(guard);
        prepared.apply(aggregation_context);
    }

    fn prepare_add_child<'c>(
        self: &Arc<Node>,
        aggregation_context: &'c NodeAggregationContext<'c>,
        child: Arc<Node>,
    ) -> impl PreparedOperation<NodeAggregationContext<'c>> {
        let mut guard = self.inner.lock();
        guard.children.push(child.clone());
        let number_of_children = guard.children.len();
        let mut guard = unsafe { NodeGuard::new(guard, self.clone()) };
        handle_new_edge(
            aggregation_context,
            &mut guard,
            &NodeRef(self.clone()),
            &NodeRef(child),
            number_of_children,
        )
    }

    fn prepare_aggregation_number<'c>(
        self: &Arc<Node>,
        aggregation_context: &'c NodeAggregationContext<'c>,
        aggregation_number: u32,
    ) -> impl PreparedOperation<NodeAggregationContext<'c>> {
        let mut guard = self.inner.lock();
        guard.aggregation_node.increase_aggregation_number(
            aggregation_context,
            &NodeRef(self.clone()),
            aggregation_number,
        )
    }

    fn remove_child(
        self: &Arc<Node>,
        aggregation_context: &NodeAggregationContext,
        child: &Arc<Node>,
    ) {
        self.remove_child_unchecked(aggregation_context, child);
        check_invariants(aggregation_context, once(NodeRef(self.clone())));
    }

    fn remove_child_unchecked(
        self: &Arc<Node>,
        aggregation_context: &NodeAggregationContext,
        child: &Arc<Node>,
    ) {
        let mut guard = self.inner.lock();
        if let Some(idx) = guard
            .children
            .iter()
            .position(|item| Arc::ptr_eq(item, child))
        {
            guard.children.swap_remove(idx);
            handle_lost_edges(
                aggregation_context,
                unsafe { NodeGuard::new(guard, self.clone()) },
                &NodeRef(self.clone()),
                [NodeRef(child.clone())],
            );
        }
    }

    fn incr(self: &Arc<Node>, aggregation_context: &NodeAggregationContext) {
        let mut guard = self.inner.lock();
        guard.value += 10000;
        let prepared = guard
            .aggregation_node
            .apply_change(aggregation_context, Change { value: 10000 });
        drop(guard);
        prepared.apply(aggregation_context);
        check_invariants(aggregation_context, once(NodeRef(self.clone())));
    }
}

#[derive(Copy, Clone)]
struct Change {
    value: i32,
}

impl Change {
    fn is_empty(&self) -> bool {
        self.value == 0
    }
}

struct NodeInner {
    children: Vec<Arc<Node>>,
    aggregation_node: AggregationNode<NodeRef, Aggregated>,
    value: u32,
}

struct NodeAggregationContext<'a> {
    additions: AtomicU32,
    #[allow(dead_code)]
    something_with_lifetime: &'a u32,
    add_value: bool,
}

#[derive(Clone, RefCast)]
#[repr(transparent)]
struct NodeRef(Arc<Node>);

impl Debug for NodeRef {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "NodeRef({})", self.0.inner.lock().value)
    }
}

impl Hash for NodeRef {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Arc::as_ptr(&self.0).hash(state);
    }
}

impl PartialEq for NodeRef {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for NodeRef {}

struct NodeGuard {
    guard: MutexGuard<'static, NodeInner>,
    // This field is important to keep the node alive
    #[allow(dead_code)]
    node: Arc<Node>,
}

impl NodeGuard {
    unsafe fn new(guard: MutexGuard<'_, NodeInner>, node: Arc<Node>) -> Self {
        NodeGuard {
            guard: unsafe {
                std::mem::transmute::<MutexGuard<'_, NodeInner>, MutexGuard<'_, NodeInner>>(guard)
            },
            node,
        }
    }
}

impl Deref for NodeGuard {
    type Target = AggregationNode<NodeRef, Aggregated>;

    fn deref(&self) -> &Self::Target {
        &self.guard.aggregation_node
    }
}

impl DerefMut for NodeGuard {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.guard.aggregation_node
    }
}

impl AggregationNodeGuard for NodeGuard {
    type Data = Aggregated;
    type NodeRef = NodeRef;
    type DataChange = Change;
    type ChildrenIter<'a> = impl Iterator<Item = NodeRef> + 'a;

    fn children(&self) -> Self::ChildrenIter<'_> {
        self.guard
            .children
            .iter()
            .map(|child| NodeRef(child.clone()))
    }

    fn get_remove_change(&self) -> Option<Change> {
        let change = Change {
            value: -(self.guard.value as i32),
        };
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }

    fn get_add_change(&self) -> Option<Change> {
        let change = Change {
            value: self.guard.value as i32,
        };
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }

    fn get_initial_data(&self) -> Self::Data {
        Aggregated {
            value: self.guard.value as i32,
            active: false,
        }
    }
}

impl AggregationContext for NodeAggregationContext<'_> {
    type Guard<'l>
        = NodeGuard
    where
        Self: 'l;
    type Data = Aggregated;
    type NodeRef = NodeRef;
    type DataChange = Change;

    fn node<'b>(&'b self, reference: &Self::NodeRef) -> Self::Guard<'b> {
        let r = reference.0.clone();
        let guard = reference.0.inner.lock();
        unsafe { NodeGuard::new(guard, r) }
    }

    fn node_pair<'b>(
        &'b self,
        id1: &Self::NodeRef,
        id2: &Self::NodeRef,
    ) -> (Self::Guard<'b>, Self::Guard<'b>) {
        let r1 = id1.0.clone();
        let r2 = id2.0.clone();
        loop {
            {
                let guard1 = id1.0.inner.lock();
                if let Some(guard2) = id2.0.inner.try_lock() {
                    return (unsafe { NodeGuard::new(guard1, r1) }, unsafe {
                        NodeGuard::new(guard2, r2)
                    });
                }
            }
            {
                let guard2 = id2.0.inner.lock();
                if let Some(guard1) = id1.0.inner.try_lock() {
                    return (unsafe { NodeGuard::new(guard1, r1) }, unsafe {
                        NodeGuard::new(guard2, r2)
                    });
                }
            }
        }
    }

    fn atomic_in_progress_counter<'l>(&self, id: &'l Self::NodeRef) -> &'l AtomicU32
    where
        Self: 'l,
    {
        &id.0.atomic
    }

    fn apply_change(&self, data: &mut Aggregated, change: &Change) -> Option<Change> {
        if data.value != 0 {
            self.additions.fetch_add(1, Ordering::SeqCst);
        }
        if self.add_value {
            data.value += change.value;
            Some(*change)
        } else {
            None
        }
    }

    fn data_to_add_change(&self, data: &Self::Data) -> Option<Self::DataChange> {
        let change = Change { value: data.value };
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }

    fn data_to_remove_change(&self, data: &Self::Data) -> Option<Self::DataChange> {
        let change = Change { value: -data.value };
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }
}

#[derive(Default)]
struct ActiveQuery {
    active: bool,
}

impl RootQuery for ActiveQuery {
    type Data = Aggregated;
    type Result = bool;

    fn query(&mut self, data: &Self::Data) -> ControlFlow<()> {
        if data.active {
            self.active = true;
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }

    fn result(self) -> Self::Result {
        self.active
    }
}

#[derive(Default)]
struct Aggregated {
    value: i32,
    active: bool,
}

#[test]
fn chain() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: true,
    };
    let root = Node::new(1);
    let mut current = root.clone();
    for i in 2..=100 {
        let node = Node::new(i);
        current.add_child(&ctx, node.clone());
        current = node;
    }
    let leaf = Node::new(10000);
    current.add_child(&ctx, leaf.clone());
    let current = NodeRef(root);

    {
        let root_info = query_root_info(&ctx, ActiveQuery::default(), NodeRef(leaf.clone()));
        assert!(!root_info);
    }

    {
        let aggregated = aggregation_data(&ctx, &current);
        assert_eq!(aggregated.value, 15050);
    }
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 182);
    ctx.additions.store(0, Ordering::SeqCst);
    check_invariants(&ctx, once(current.clone()));

    {
        let root_info = query_root_info(&ctx, ActiveQuery::default(), NodeRef(leaf.clone()));
        assert!(!root_info);
    }
    check_invariants(&ctx, once(current.clone()));

    leaf.incr(&ctx);
    // The change need to propagate through 4 aggregated nodes
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 4);
    ctx.additions.store(0, Ordering::SeqCst);

    {
        let mut aggregated = aggregation_data(&ctx, &current);
        assert_eq!(aggregated.value, 25050);
        aggregated.active = true;
    }
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 0);
    ctx.additions.store(0, Ordering::SeqCst);

    {
        let root_info = query_root_info(&ctx, ActiveQuery::default(), NodeRef(leaf.clone()));
        assert!(root_info);
    }

    let i = 101;
    let current = Node::new_with_children(&ctx, i, vec![current.0]);
    let current = NodeRef(current);

    {
        let aggregated = aggregation_data(&ctx, &current);
        assert_eq!(aggregated.value, 25151);
    }
    // This should be way less the 100 to prove that we are reusing trees
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 1);
    ctx.additions.store(0, Ordering::SeqCst);

    leaf.incr(&ctx);
    // This should be less the 20 to prove that we are reusing trees
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 5);
    ctx.additions.store(0, Ordering::SeqCst);

    {
        let root_info = query_root_info(&ctx, ActiveQuery::default(), NodeRef(leaf.clone()));
        assert!(root_info);
    }

    print(&ctx, &current, true);
    check_invariants(&ctx, once(current.clone()));
}

#[test]
fn chain_double_connected() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: true,
    };
    let root = Node::new(1);
    let mut nodes = vec![root.clone()];
    let mut current = root.clone();
    let mut current2 = Node::new(2);
    current.add_child(&ctx, current2.clone());
    nodes.push(current2.clone());
    for i in 3..=100 {
        let node = Node::new(i);
        nodes.push(node.clone());
        current.add_child(&ctx, node.clone());
        current2.add_child(&ctx, node.clone());
        current = current2;
        current2 = node;
    }
    let current = NodeRef(root);

    {
        let aggregated = aggregation_data(&ctx, &current);
        assert_eq!(aggregated.value, 20017);
    }
    check_invariants(&ctx, once(current.clone()));
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 643);
    ctx.additions.store(0, Ordering::SeqCst);

    print(&ctx, &current, true);

    for i in 2..nodes.len() {
        nodes[i - 2].remove_child(&ctx, &nodes[i]);
        nodes[i - 1].remove_child(&ctx, &nodes[i]);
    }
    nodes[0].remove_child(&ctx, &nodes[1]);

    {
        let aggregated = aggregation_data(&ctx, &current);
        assert_eq!(aggregated.value, 1);
    }
}

const RECT_SIZE: usize = 30;
const RECT_MULT: usize = 100;

#[test]
fn rectangle_tree() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: false,
    };
    let mut nodes: Vec<Vec<Arc<Node>>> = Vec::new();
    let mut extra_nodes = Vec::new();
    for y in 0..RECT_SIZE {
        let mut line: Vec<Arc<Node>> = Vec::new();
        for x in 0..RECT_SIZE {
            let mut parents = Vec::new();
            if x > 0 {
                parents.push(line[x - 1].clone());
            }
            if y > 0 {
                parents.push(nodes[y - 1][x].clone());
            }
            let value = (x + y * RECT_MULT) as u32;
            let node = Node::new(value);
            if x == 0 || y == 0 {
                let extra_node = Node::new(value + 100000);
                prepare_aggregation_data(&ctx, &NodeRef(extra_node.clone()));
                extra_node.add_child(&ctx, node.clone());
                extra_nodes.push(extra_node);
                prepare_aggregation_data(&ctx, &NodeRef(node.clone()));
            }
            for parent in parents {
                parent.add_child_unchecked(&ctx, node.clone());
            }
            if x == 0 || y == 0 {
                prepare_aggregation_data(&ctx, &NodeRef(node.clone()));
            }
            line.push(node);
        }
        nodes.push(line);
    }

    check_invariants(&ctx, extra_nodes.iter().cloned().map(NodeRef));

    let root = NodeRef(extra_nodes[0].clone());
    print(&ctx, &root, false);
}

#[rstest]
#[case::many_roots_initial(100000, 0, 2, 1)]
#[case::many_roots_later(1, 100000, 2, 1)]
#[case::many_roots_later2(0, 100000, 2, 1)]
#[case::many_roots(50000, 50000, 2, 1)]
#[case::many_children(2, 0, 100000, 1)]
#[case::many_roots_and_children(5000, 5000, 10000, 1)]
#[case::many_roots_and_subgraph(5000, 5000, 100, 2)]
#[case::large_subgraph_a(9, 1, 10, 5)]
#[case::large_subgraph_b(5, 5, 10, 5)]
#[case::large_subgraph_c(1, 9, 10, 5)]
#[case::large_subgraph_d(6, 0, 10, 5)]
#[case::large_subgraph_e(0, 10, 10, 5)]
#[case::many_roots_large_subgraph(5000, 5000, 10, 5)]
fn performance(
    #[case] initial_root_count: u32,
    #[case] additional_root_count: u32,
    #[case] children_count: u32,
    #[case] children_layers_count: u32,
) {
    fn print_aggregation_numbers(node: Arc<Node>) {
        print!("Aggregation numbers ");
        let mut current = node.clone();
        loop {
            let guard = current.inner.lock();
            let n = guard.aggregation_node.aggregation_number();
            let f = guard.aggregation_node.followers().map_or(0, |f| f.len());
            let u = guard.aggregation_node.uppers().len();
            print!(" -> {} [{}U {}F]", n, u, f);
            if guard.children.is_empty() {
                break;
            }
            let child = guard.children[guard.children.len() / 2].clone();
            drop(guard);
            current = child;
        }
        println!();
    }

    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: false,
    };
    let mut roots: Vec<Arc<Node>> = Vec::new();
    let inner_node = Node::new(0);
    // Setup
    for i in 0..initial_root_count {
        let node = Node::new(2 + i);
        roots.push(node.clone());
        aggregation_data(&ctx, &NodeRef(node.clone())).active = true;
        node.add_child_unchecked(&ctx, inner_node.clone());
    }
    let start = Instant::now();
    let mut children = vec![inner_node.clone()];
    for j in 0..children_layers_count {
        let mut new_children = Vec::new();
        for child in children {
            for i in 0..children_count {
                let node = Node::new(1000000 * (j + 1) + i);
                new_children.push(node.clone());
                child.add_child_unchecked(&ctx, node.clone());
            }
        }
        children = new_children;
    }
    println!("Setup children: {:?}", start.elapsed());

    print_aggregation_numbers(inner_node.clone());

    let start = Instant::now();
    for i in 0..additional_root_count {
        let node = Node::new(2 + i);
        roots.push(node.clone());
        aggregation_data(&ctx, &NodeRef(node.clone())).active = true;
        node.add_child_unchecked(&ctx, inner_node.clone());
    }
    println!("Setup additional roots: {:?}", start.elapsed());

    print_aggregation_numbers(inner_node.clone());

    // Add another root
    let start = Instant::now();
    {
        let node = Node::new(1);
        roots.push(node.clone());
        aggregation_data(&ctx, &NodeRef(node.clone())).active = true;
        node.add_child_unchecked(&ctx, inner_node.clone());
    }
    let root_duration = start.elapsed();
    println!("Root: {:?}", root_duration);

    // Add another child
    let start = Instant::now();
    {
        let node = Node::new(999999);
        inner_node.add_child_unchecked(&ctx, node.clone());
    }
    let child_duration = start.elapsed();
    println!("Child: {:?}", child_duration);

    print_aggregation_numbers(inner_node.clone());

    assert!(root_duration.as_micros() < 10000);
    assert!(child_duration.as_micros() < 10000);

    // check_invariants(&ctx, roots.iter().cloned().map(NodeRef));
}

#[test]
fn many_children() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: false,
    };
    let mut roots: Vec<Arc<Node>> = Vec::new();
    let mut children: Vec<Arc<Node>> = Vec::new();
    const CHILDREN: u32 = 100000;
    const ROOTS: u32 = 3;
    let inner_node = Node::new(0);
    let start = Instant::now();
    for i in 0..ROOTS {
        let node = Node::new(10000 + i);
        roots.push(node.clone());
        aggregation_data(&ctx, &NodeRef(node.clone())).active = true;
        node.add_child_unchecked(&ctx, inner_node.clone());
    }
    println!("Roots: {:?}", start.elapsed());
    let start = Instant::now();
    for i in 0..CHILDREN {
        let node = Node::new(20000 + i);
        children.push(node.clone());
        inner_node.add_child_unchecked(&ctx, node.clone());
    }
    println!("Children: {:?}", start.elapsed());
    let start = Instant::now();
    for i in 0..CHILDREN {
        let node = Node::new(40000 + i);
        children.push(node.clone());
        inner_node.add_child_unchecked(&ctx, node.clone());
    }
    let children_duration = start.elapsed();
    println!("Children: {:?}", children_duration);
    for j in 0.. {
        let start = Instant::now();
        for i in 0..CHILDREN {
            let node = Node::new(50000 + j * 10000 + i);
            children.push(node.clone());
            inner_node.add_child_unchecked(&ctx, node.clone());
        }
        let dur = start.elapsed();
        println!("Children: {:?}", dur);
        let is_slow = dur > children_duration * 2;
        if j > 10 && !is_slow {
            break;
        }
        if j > 20 {
            panic!("Adding children has become slower over time");
        }
    }

    let start = Instant::now();
    for i in 0..ROOTS {
        let node = Node::new(30000 + i);
        roots.push(node.clone());
        aggregation_data(&ctx, &NodeRef(node.clone())).active = true;
        node.add_child_unchecked(&ctx, inner_node.clone());
    }
    println!("Roots: {:?}", start.elapsed());

    check_invariants(&ctx, roots.iter().cloned().map(NodeRef));

    // let root = NodeRef(roots[0].clone());
    // print(&ctx, &root, false);
}

#[test]
fn concurrent_modification() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: true,
    };
    let root1 = Node::new(1);
    let root2 = Node::new(2);
    let helper = Node::new(3);
    let inner_node = Node::new(10);
    let outer_node1 = Node::new(11);
    let outer_node2 = Node::new(12);
    let outer_node3 = Node::new(13);
    let outer_node4 = Node::new(14);
    inner_node.add_child(&ctx, outer_node1.clone());
    inner_node.add_child(&ctx, outer_node2.clone());
    root2.add_child(&ctx, helper.clone());
    outer_node1.prepare_aggregation_number(&ctx, 7).apply(&ctx);
    outer_node3.prepare_aggregation_number(&ctx, 7).apply(&ctx);
    root1.prepare_aggregation_number(&ctx, 8).apply(&ctx);
    root2.prepare_aggregation_number(&ctx, 4).apply(&ctx);
    helper.prepare_aggregation_number(&ctx, 3).apply(&ctx);

    let add_job1 = root1.prepare_add_child(&ctx, inner_node.clone());
    let add_job2 = inner_node.prepare_add_child(&ctx, outer_node3.clone());
    let add_job3 = inner_node.prepare_add_child(&ctx, outer_node4.clone());
    let add_job4 = helper.prepare_add_child(&ctx, inner_node.clone());

    add_job4.apply(&ctx);
    print_all(&ctx, [root1.clone(), root2.clone()].map(NodeRef), true);
    add_job3.apply(&ctx);
    print_all(&ctx, [root1.clone(), root2.clone()].map(NodeRef), true);
    add_job2.apply(&ctx);
    print_all(&ctx, [root1.clone(), root2.clone()].map(NodeRef), true);
    add_job1.apply(&ctx);

    print_all(&ctx, [root1.clone(), root2.clone()].map(NodeRef), true);

    check_invariants(&ctx, [root1, root2].map(NodeRef));
}

#[test]
fn fuzzy_new() {
    for size in [10, 50, 100, 200, 1000] {
        for _ in 0..100 {
            let seed = rand::random();
            println!("Seed {} Size {}", seed, size);
            fuzzy(seed, size);
        }
    }
}

#[rstest]
#[case::a(4059591975, 10)]
#[case::b(603692396, 100)]
#[case::c(3317876847, 10)]
#[case::d(4012518846, 50)]
fn fuzzy(#[case] seed: u32, #[case] count: u32) {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: true,
    };

    let mut seed_buffer = [0; 32];
    seed_buffer[0..4].copy_from_slice(&seed.to_be_bytes());
    let mut r = SmallRng::from_seed(seed_buffer);
    let mut nodes = Vec::new();
    for i in 0..count {
        nodes.push(Node::new(i));
    }
    prepare_aggregation_data(&ctx, &NodeRef(nodes[0].clone()));

    let mut edges = FxIndexSet::default();

    for _ in 0..1000 {
        match r.gen_range(0..=2) {
            0 | 1 => {
                // if x == 47 {
                //     print_all(&ctx, nodes.iter().cloned().map(NodeRef), true);
                // }
                // add edge
                let parent = r.gen_range(0..nodes.len() - 1);
                let child = r.gen_range(parent + 1..nodes.len());
                // println!("add edge {} -> {}", parent, child);
                if edges.insert((parent, child)) {
                    nodes[parent].add_child(&ctx, nodes[child].clone());
                }
            }
            2 => {
                // remove edge
                if edges.is_empty() {
                    continue;
                }
                let i = r.gen_range(0..edges.len());
                let (parent, child) = edges.swap_remove_index(i).unwrap();
                // println!("remove edge {} -> {}", parent, child);
                nodes[parent].remove_child(&ctx, &nodes[child]);
            }
            _ => unreachable!(),
        }
    }

    for (parent, child) in edges {
        nodes[parent].remove_child(&ctx, &nodes[child]);
    }

    assert_eq!(aggregation_data(&ctx, &NodeRef(nodes[0].clone())).value, 0);

    check_invariants(&ctx, nodes.iter().cloned().map(NodeRef));

    for node in nodes {
        let lock = node.inner.lock();
        if let AggregationNode::Aggegating(a) = &lock.aggregation_node {
            assert_eq!(a.data.value, lock.value as i32);
        }
    }
}

fn print(aggregation_context: &NodeAggregationContext<'_>, root: &NodeRef, show_internal: bool) {
    print_all(aggregation_context, once(root.clone()), show_internal);
}

fn print_all(
    aggregation_context: &NodeAggregationContext<'_>,
    nodes: impl IntoIterator<Item = NodeRef>,
    show_internal: bool,
) {
    println!("digraph {{");
    print_graph(aggregation_context, nodes, show_internal, |item| {
        let lock = item.0.inner.lock();
        if let AggregationNode::Aggegating(a) = &lock.aggregation_node {
            format!("#{} [{}]", lock.value, a.data.value)
        } else {
            format!("#{}", lock.value)
        }
    });
    println!("\n}}");
}
