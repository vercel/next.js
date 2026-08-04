// These unused (underscore-prefixed) helpers are future-racing combinators: they are
// generic over arbitrary `Future`s and select whichever completes first, which has no
// meaningful synchronous counterpart. They are async-build-only; nothing references
// them in either build.
#![cfg_attr(feature = "sync", allow(unused_imports))]

use std::{collections::HashSet, future::Future, hash::Hash, pin::Pin, task::Poll};

#[cfg(not(feature = "sync"))]
pub fn _race_pop<'a, T: 'a, F: Future<Output = T> + Unpin>(
    futures: &'a mut Vec<F>,
) -> impl Future<Output = Option<T>> + 'a {
    _FutureRacePop { futures }
}

#[cfg(not(feature = "sync"))]
struct _FutureRacePop<'a, T, F: Future<Output = T> + Unpin> {
    futures: &'a mut Vec<F>,
}

#[cfg(not(feature = "sync"))]
impl<T, F: Future<Output = T> + Unpin> Future for _FutureRacePop<'_, T, F> {
    type Output = Option<T>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> Poll<Self::Output> {
        if self.futures.is_empty() {
            return Poll::Ready(None);
        }
        match self.futures.iter_mut().enumerate().find_map(|(i, future)| {
            match Pin::new(future).poll(cx) {
                Poll::Ready(res) => Some((i, res)),
                Poll::Pending => None,
            }
        }) {
            Some((i, res)) => {
                self.futures.swap_remove(i);
                Poll::Ready(Some(res))
            }
            None => Poll::Pending,
        }
    }
}
#[cfg(not(feature = "sync"))]
pub async fn _visit<N, V, F, R, L, G, T>(node: N, visit: V, get_referenced_nodes: R) -> Vec<T>
where
    N: Clone + Hash + PartialEq + Eq,
    V: Fn(N) -> F,
    F: Future<Output = T>,
    R: Fn(N) -> G,
    L: IntoIterator<Item = N>,
    G: Future<Output = L>,
{
    let mut visited = HashSet::new();
    let mut results = Vec::new();
    visited.insert(node.clone());
    let mut queue = vec![node];
    let mut futures_queue = Vec::new();
    loop {
        match queue.pop() {
            Some(node) => {
                results.push(turbo_tasks::read!(visit(node.clone())));
                futures_queue.push(Box::pin(get_referenced_nodes(node)));
            }
            None => match turbo_tasks::read!(_race_pop(&mut futures_queue)) {
                Some(iter) => {
                    for node in iter {
                        if !visited.contains(&node) {
                            visited.insert(node.clone());
                            queue.push(node.clone());
                        }
                    }
                }
                None => break,
            },
        }
    }
    assert!(futures_queue.is_empty());
    results
}
