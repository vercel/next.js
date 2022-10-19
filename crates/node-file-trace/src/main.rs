#![feature(min_specialization)]

/// Explicit extern crate to use allocator.
extern crate turbo_malloc;

use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use node_file_trace::{start, Args};

#[tokio::main]
async fn main() -> Result<()> {
    #[cfg(feature = "tokio_console")]
    console_subscriber::init();
    let args = Arc::new(Args::parse());

    start(args).await
}
