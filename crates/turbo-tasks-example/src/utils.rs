use std::{future::Future, pin::Pin, task::Poll};

pub fn race_pop<'a, T: 'a, F: Future<Output = T> + Unpin>(
    futures: &'a mut Vec<F>,
) -> impl Future<Output = Option<T>> + 'a {
    FutureRacePop { futures }
}

struct FutureRacePop<'a, T, F: Future<Output = T> + Unpin> {
    futures: &'a mut Vec<F>,
}

impl<'a, T, F: Future<Output = T> + Unpin> Future for FutureRacePop<'a, T, F> {
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
