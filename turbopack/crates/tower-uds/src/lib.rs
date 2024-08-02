//! tower-uds
//!
//! A unix domain socket server for the `tower` ecosystem.

#![feature(impl_trait_in_assoc_type)]

use std::{future::Future, path::Path};

use tower::Service;

pub struct UDSConnector<'a> {
    path: &'a Path,
}

impl<'a> UDSConnector<'a> {
    pub fn new(path: &'a Path) -> Self {
        Self { path }
    }
}

impl<'a, T> Service<T> for UDSConnector<'a> {
    #[cfg(not(target_os = "windows"))]
    type Response = tokio::net::UnixStream;

    // tokio does not support UDS on windows, so we need to use async-io
    // with a tokio compat layer instead
    #[cfg(target_os = "windows")]
    type Response = tokio_util::compat::Compat<async_io::Async<uds_windows::UnixStream>>;

    type Error = std::io::Error;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>> + 'a;

    fn poll_ready(
        &mut self,
        _cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        Ok(()).into()
    }

    fn call(&mut self, _req: T) -> Self::Future {
        // we need to make sure our ref is immutable so that the closure has a lifetime
        // of 'a, not the anonymous lifetime of the call method
        let path = self.path;

        #[cfg(not(target_os = "windows"))]
        {
            async move { tokio::net::UnixStream::connect(path).await }
        }
        #[cfg(target_os = "windows")]
        {
            async move {
                use tokio_util::compat::FuturesAsyncReadCompatExt;
                let stream = uds_windows::UnixStream::connect(path)?;
                Ok(FuturesAsyncReadCompatExt::compat(async_io::Async::new(
                    stream,
                )?))
            }
        }
    }
}
