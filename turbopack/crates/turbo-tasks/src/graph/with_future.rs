use std::{future::Future, mem::replace};

use pin_project_lite::pin_project;
use tracing::Span;

pin_project! {
    pub struct With<T, H>
    where
        T: Future,
    {
        #[pin]
        future: T,
        span: Span,
        data: Option<H>,
    }
}

impl<T, H> With<T, H>
where
    T: Future,
{
    pub fn new(future: T, span: Span, data: H) -> Self {
        Self {
            future,
            span,
            data: Some(data),
        }
    }
}

impl<T, H> Future for With<T, H>
where
    T: Future,
{
    type Output = (H, Span, T::Output);

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = self.project();
        let guard = this.span.enter();
        match this.future.poll(cx) {
            std::task::Poll::Ready(result) => {
                drop(guard);
                std::task::Poll::Ready((
                    this.data.take().expect("polled after completion"),
                    replace(this.span, Span::none()),
                    result,
                ))
            }
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}
