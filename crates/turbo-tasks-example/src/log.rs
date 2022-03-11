use anyhow::Result;

use crate::math::I32ValueRef;

#[turbo_tasks::function]
pub async fn log(a: I32ValueRef, options: LoggingOptionsRef) -> Result<()> {
    let options = options.await?;
    let a = a.await?;
    println!("{}: {}", options.name, a.value);
    Ok(())
}

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq)]
pub struct LoggingOptions {
    pub name: String,
}
