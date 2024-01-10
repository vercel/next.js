use std::{
    borrow::Cow,
    hash::Hash,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc,
    },
    time::Instant,
};

use nohash_hasher::IsEnabled;
use parking_lot::{Mutex, MutexGuard};
use ref_cast::RefCast;

use super::{aggregation_info, AggregationContext, AggregationItemLock, AggregationTreeLeaf};
use crate::aggregation_tree::{bottom_tree::print_graph, leaf::ensure_thresholds};

struct Node {
    inner: Mutex<NodeInner>,
}

impl Node {
    fn incr(&self, aggregation_context: &NodeAggregationContext) {
        let mut guard = self.inner.lock();
        guard.value += 10000;
        guard
            .aggregation_leaf
            .change(aggregation_context, &Change { value: 10000 });
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
    aggregation_leaf: AggregationTreeLeaf<Aggregated, NodeRef>,
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

impl Hash for NodeRef {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        Arc::as_ptr(&self.0).hash(state);
    }
}

impl IsEnabled for NodeRef {}

impl PartialEq for NodeRef {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

impl Eq for NodeRef {}

struct NodeGuard {
    guard: MutexGuard<'static, NodeInner>,
    node: Arc<Node>,
}

impl NodeGuard {
    unsafe fn new(guard: MutexGuard<'_, NodeInner>, node: Arc<Node>) -> Self {
        NodeGuard {
            guard: unsafe { std::mem::transmute(guard) },
            node,
        }
    }
}

impl AggregationItemLock for NodeGuard {
    type Info = Aggregated;
    type ItemRef = NodeRef;
    type ItemChange = Change;
    type ChildrenIter<'a> = impl Iterator<Item = Cow<'a, NodeRef>> + 'a;

    fn reference(&self) -> &Self::ItemRef {
        NodeRef::ref_cast(&self.node)
    }

    fn leaf(&mut self) -> &mut AggregationTreeLeaf<Aggregated, NodeRef> {
        &mut self.guard.aggregation_leaf
    }

    fn number_of_children(&self) -> usize {
        self.guard.children.len()
    }

    fn children(&self) -> Self::ChildrenIter<'_> {
        self.guard
            .children
            .iter()
            .map(|child| Cow::Owned(NodeRef(child.clone())))
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
}

impl<'a> AggregationContext for NodeAggregationContext<'a> {
    type ItemLock<'l> = NodeGuard where Self: 'l;
    type Info = Aggregated;
    type ItemRef = NodeRef;
    type ItemChange = Change;

    fn item<'b>(&'b self, reference: &Self::ItemRef) -> Self::ItemLock<'b> {
        let r = reference.0.clone();
        let guard = reference.0.inner.lock();
        unsafe { NodeGuard::new(guard, r) }
    }

    fn apply_change(&self, info: &mut Aggregated, change: &Change) -> Option<Change> {
        if info.value != 0 {
            self.additions.fetch_add(1, Ordering::SeqCst);
        }
        if self.add_value {
            info.value += change.value;
        }
        Some(*change)
    }

    fn info_to_add_change(&self, info: &Self::Info) -> Option<Self::ItemChange> {
        let change = Change { value: info.value };
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }

    fn info_to_remove_change(&self, info: &Self::Info) -> Option<Self::ItemChange> {
        let change = Change { value: -info.value };
        if change.is_empty() {
            None
        } else {
            Some(change)
        }
    }

    type RootInfo = bool;

    type RootInfoType = ();

    fn new_root_info(&self, root_info_type: &Self::RootInfoType) -> Self::RootInfo {
        #[allow(clippy::match_single_binding)]
        match root_info_type {
            () => false,
        }
    }

    fn info_to_root_info(
        &self,
        info: &Self::Info,
        root_info_type: &Self::RootInfoType,
    ) -> Self::RootInfo {
        #[allow(clippy::match_single_binding)]
        match root_info_type {
            () => info.active,
        }
    }

    fn merge_root_info(
        &self,
        root_info: &mut Self::RootInfo,
        other: Self::RootInfo,
    ) -> std::ops::ControlFlow<()> {
        if other {
            *root_info = true;
            std::ops::ControlFlow::Break(())
        } else {
            std::ops::ControlFlow::Continue(())
        }
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
    let leaf = Arc::new(Node {
        inner: Mutex::new(NodeInner {
            children: vec![],
            aggregation_leaf: AggregationTreeLeaf::new(),
            value: 10000,
        }),
    });
    let mut current = leaf.clone();
    for i in 1..=100 {
        current = Arc::new(Node {
            inner: Mutex::new(NodeInner {
                children: vec![current],
                aggregation_leaf: AggregationTreeLeaf::new(),
                value: i,
            }),
        });
    }
    let current = NodeRef(current);

    {
        let root_info = leaf.inner.lock().aggregation_leaf.get_root_info(&ctx, &());
        assert!(!root_info);
    }

    {
        let aggregated = aggregation_info(&ctx, &current);
        assert_eq!(aggregated.lock().value, 15050);
    }
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 100);
    ctx.additions.store(0, Ordering::SeqCst);

    print(&ctx, &current);

    {
        let root_info = leaf.inner.lock().aggregation_leaf.get_root_info(&ctx, &());
        assert!(!root_info);
    }

    leaf.incr(&ctx);
    // The change need to propagate through 5 top trees and 5 bottom trees
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 6);
    ctx.additions.store(0, Ordering::SeqCst);

    {
        let aggregated = aggregation_info(&ctx, &current);
        let mut aggregated = aggregated.lock();
        assert_eq!(aggregated.value, 25050);
        aggregated.active = true;
    }
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 0);
    ctx.additions.store(0, Ordering::SeqCst);

    {
        let root_info = leaf.inner.lock().aggregation_leaf.get_root_info(&ctx, &());
        assert!(root_info);
    }

    let i = 101;
    let current = Arc::new(Node {
        inner: Mutex::new(NodeInner {
            children: vec![current.0],
            aggregation_leaf: AggregationTreeLeaf::new(),
            value: i,
        }),
    });
    let current = NodeRef(current);

    {
        let aggregated = aggregation_info(&ctx, &current);
        let aggregated = aggregated.lock();
        assert_eq!(aggregated.value, 25151);
    }
    // This should be way less the 100 to prove that we are reusing trees
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 1);
    ctx.additions.store(0, Ordering::SeqCst);

    leaf.incr(&ctx);
    // This should be less the 20 to prove that we are reusing trees
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 9);
    ctx.additions.store(0, Ordering::SeqCst);

    {
        let root_info = leaf.inner.lock().aggregation_leaf.get_root_info(&ctx, &());
        assert!(root_info);
    }
}

#[test]
fn chain_double_connected() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: true,
    };
    let leaf = Arc::new(Node {
        inner: Mutex::new(NodeInner {
            children: vec![],
            aggregation_leaf: AggregationTreeLeaf::new(),
            value: 1,
        }),
    });
    let mut current = leaf.clone();
    let mut current2 = Arc::new(Node {
        inner: Mutex::new(NodeInner {
            children: vec![leaf.clone()],
            aggregation_leaf: AggregationTreeLeaf::new(),
            value: 2,
        }),
    });
    for i in 3..=100 {
        let new_node = Arc::new(Node {
            inner: Mutex::new(NodeInner {
                children: vec![current, current2.clone()],
                aggregation_leaf: AggregationTreeLeaf::new(),
                value: i,
            }),
        });
        current = current2;
        current2 = new_node;
    }
    let current = NodeRef(current2);

    print(&ctx, &current);

    {
        let aggregated = aggregation_info(&ctx, &current);
        assert_eq!(aggregated.lock().value, 8230);
    }
    assert_eq!(ctx.additions.load(Ordering::SeqCst), 204);
    ctx.additions.store(0, Ordering::SeqCst);
}

const RECT_SIZE: usize = 100;
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
    for y in 0..RECT_SIZE {
        let mut line: Vec<Arc<Node>> = Vec::new();
        for x in 0..RECT_SIZE {
            let mut children = Vec::new();
            if x > 0 {
                children.push(line[x - 1].clone());
            }
            if y > 0 {
                children.push(nodes[y - 1][x].clone());
            }
            let value = (x + y * RECT_MULT) as u32;
            let node = Arc::new(Node {
                inner: Mutex::new(NodeInner {
                    children,
                    aggregation_leaf: AggregationTreeLeaf::new(),
                    value,
                }),
            });
            line.push(node.clone());
        }
        nodes.push(line);
    }

    let root = NodeRef(nodes[RECT_SIZE - 1][RECT_SIZE - 1].clone());

    print(&ctx, &root);
}

#[test]
fn rectangle_adding_tree() {
    let something_with_lifetime = 0;
    let ctx = NodeAggregationContext {
        additions: AtomicU32::new(0),
        something_with_lifetime: &something_with_lifetime,
        add_value: false,
    };
    let mut nodes: Vec<Vec<Arc<Node>>> = Vec::new();

    fn add_child(
        parent: &Arc<Node>,
        node: &Arc<Node>,
        aggregation_context: &NodeAggregationContext<'_>,
    ) {
        let node_ref = NodeRef(node.clone());
        let mut state = parent.inner.lock();
        state.children.push(node.clone());
        let job = state
            .aggregation_leaf
            .add_child_job(aggregation_context, &node_ref);
        drop(state);
        job();
    }
    for y in 0..RECT_SIZE {
        let mut line: Vec<Arc<Node>> = Vec::new();
        for x in 0..RECT_SIZE {
            let value = (x + y * RECT_MULT) as u32;
            let node = Arc::new(Node {
                inner: Mutex::new(NodeInner {
                    children: Vec::new(),
                    aggregation_leaf: AggregationTreeLeaf::new(),
                    value,
                }),
            });
            line.push(node.clone());
            if x > 0 {
                let parent = &line[x - 1];
                add_child(parent, &node, &ctx);
            }
            if y > 0 {
                let parent = &nodes[y - 1][x];
                add_child(parent, &node, &ctx);
            }
            if x == 0 && y == 0 {
                aggregation_info(&ctx, &NodeRef(node.clone())).lock().active = true;
            }
        }
        nodes.push(line);
    }

    let root = NodeRef(nodes[0][0].clone());

    print(&ctx, &root);
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
    const CHILDREN: u32 = 5000;
    const ROOTS: u32 = 100;
    let inner_node = Arc::new(Node {
        inner: Mutex::new(NodeInner {
            children: Vec::new(),
            aggregation_leaf: AggregationTreeLeaf::new(),
            value: 0,
        }),
    });
    let start = Instant::now();
    for i in 0..ROOTS {
        let node = Arc::new(Node {
            inner: Mutex::new(NodeInner {
                children: Vec::new(),
                aggregation_leaf: AggregationTreeLeaf::new(),
                value: 10000 + i,
            }),
        });
        roots.push(node.clone());
        aggregation_info(&ctx, &NodeRef(node.clone())).lock().active = true;
        connect_child(&ctx, &node, &inner_node);
    }
    println!("Roots: {:?}", start.elapsed());
    let start = Instant::now();
    for i in 0..CHILDREN {
        let node = Arc::new(Node {
            inner: Mutex::new(NodeInner {
                children: Vec::new(),
                aggregation_leaf: AggregationTreeLeaf::new(),
                value: 20000 + i,
            }),
        });
        children.push(node.clone());
        connect_child(&ctx, &inner_node, &node);
    }
    println!("Children: {:?}", start.elapsed());
    let start = Instant::now();
    for i in 0..ROOTS {
        let node = Arc::new(Node {
            inner: Mutex::new(NodeInner {
                children: Vec::new(),
                aggregation_leaf: AggregationTreeLeaf::new(),
                value: 30000 + i,
            }),
        });
        roots.push(node.clone());
        aggregation_info(&ctx, &NodeRef(node.clone())).lock().active = true;
        connect_child(&ctx, &node, &inner_node);
    }
    println!("Roots: {:?}", start.elapsed());
    let start = Instant::now();
    for i in 0..CHILDREN {
        let node = Arc::new(Node {
            inner: Mutex::new(NodeInner {
                children: Vec::new(),
                aggregation_leaf: AggregationTreeLeaf::new(),
                value: 40000 + i,
            }),
        });
        children.push(node.clone());
        connect_child(&ctx, &inner_node, &node);
    }
    let children_duration = start.elapsed();
    println!("Children: {:?}", children_duration);
    let mut number_of_slow_children = 0;
    for _ in 0..10 {
        let start = Instant::now();
        for i in 0..CHILDREN {
            let node = Arc::new(Node {
                inner: Mutex::new(NodeInner {
                    children: Vec::new(),
                    aggregation_leaf: AggregationTreeLeaf::new(),
                    value: 40000 + i,
                }),
            });
            children.push(node.clone());
            connect_child(&ctx, &inner_node, &node);
        }
        let dur = start.elapsed();
        println!("Children: {:?}", dur);
        if dur > children_duration * 2 {
            number_of_slow_children += 1;
        }
    }

    // Technically it should always be 0, but the performance of the environment
    // might vary so we accept a few slow children
    assert!(number_of_slow_children < 3);

    let root = NodeRef(roots[0].clone());

    print(&ctx, &root);
}

fn connect_child(
    aggregation_context: &NodeAggregationContext<'_>,
    parent: &Arc<Node>,
    child: &Arc<Node>,
) {
    let state = parent.inner.lock();
    let node_ref = NodeRef(child.clone());
    let mut node_guard = unsafe { NodeGuard::new(state, parent.clone()) };
    while let Some(job) = ensure_thresholds(aggregation_context, &mut node_guard) {
        drop(node_guard);
        job();
        node_guard = unsafe { NodeGuard::new(parent.inner.lock(), parent.clone()) };
    }
    let NodeGuard {
        guard: mut state, ..
    } = node_guard;
    state.children.push(child.clone());
    let job = state
        .aggregation_leaf
        .add_child_job(aggregation_context, &node_ref);
    drop(state);
    job();
}

fn print(aggregation_context: &NodeAggregationContext<'_>, current: &NodeRef) {
    println!("digraph {{");
    let start = 0;
    let end = 3;
    for i in start..end {
        print_graph(aggregation_context, current, i, false, |item| {
            format!("{}", item.0.inner.lock().value)
        });
    }
    for i in start + 1..end + 1 {
        print_graph(aggregation_context, current, i, true, |item| {
            format!("{}", item.0.inner.lock().value)
        });
    }
    println!("\n}}");
}
