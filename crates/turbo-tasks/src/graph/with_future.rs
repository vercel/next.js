use std::future::Future;

use pin_project_lite::pin_project;

pin_project! {
    pub struct With<T, H>
    where
        T: Future,
    {
        #[pin]
        future: T,
        handle: Option<H>,
    }
}

impl<T, H> With<T, H>
where
    T: Future,
{
    pub fn new(future: T, handle: H) -> Self {
        Self {
            future,
            handle: Some(handle),
        }
    }
}

impl<T, H> Future for With<T, H>
where
    T: Future,
{
    type Output = (H, T::Output);

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let this = self.project();
        match this.future.poll(cx) {
            std::task::Poll::Ready(result) => std::task::Poll::Ready((
                this.handle.take().expect("polled after completion"),
                result,
            )),
            std::task::Poll::Pending => std::task::Poll::Pending,
        }
    }
}
