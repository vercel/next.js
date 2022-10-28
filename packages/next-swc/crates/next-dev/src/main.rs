#![feature(future_join)]
#![feature(min_specialization)]

use anyhow::Result;
#[cfg(feature = "cli")]
use clap::Parser;

#[cfg(not(feature = "cli"))]
fn main() -> Result<()> {
    unimplemented!("Cannot run binary without CLI feature enabled");
}

#[tokio::main]
#[cfg(feature = "cli")]
async fn main() -> Result<()> {
    let options = next_dev::devserver_options::DevServerOptions::parse();

    next_dev::start_server(&options).await
}
