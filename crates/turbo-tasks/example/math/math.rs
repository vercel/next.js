use std::time::Duration;

use anyhow::Result;

#[turbo_tasks::function]
pub async fn add(a: I32ValueVc, b: I32ValueVc) -> Result<I32ValueVc> {
    let a = a.await?.value;
    let b = b.await?.value;
    println!("{} + {} = ...", a, b);
    async_std::task::sleep(Duration::from_millis(500)).await;
    println!("{} + {} = {}", a, b, a + b);
    Ok(I32ValueVc::new(a + b))
}

#[turbo_tasks::function]
pub async fn max_new(a: I32ValueVc, b: I32ValueVc) -> Result<I32ValueVc> {
    let a = a.await?.value;
    let b = b.await?.value;
    println!("max({}, {}) = ...", a, b);
    async_std::task::sleep(Duration::from_millis(500)).await;
    let max = if a > b { a } else { b };
    println!("max({}, {}) = {}", a, b, max);
    Ok(I32ValueVc::new(max))
}

#[turbo_tasks::function]
pub async fn max_reuse(a_ref: I32ValueVc, b_ref: I32ValueVc) -> Result<I32ValueVc> {
    let a = a_ref.get().await?.value;
    let b = b_ref.get().await?.value;
    println!("max({}, {}) = ...", a, b);
    async_std::task::sleep(Duration::from_millis(500)).await;
    println!("max({}, {}) = {}", a, b, a + b);
    Ok(if a > b { a_ref } else { b_ref })
}

#[turbo_tasks::value]
pub struct I32Value {
    pub value: i32,
}

#[turbo_tasks::value_impl]
impl I32Value {
    #[turbo_tasks::constructor(compare: is)]
    pub fn new(value: i32) -> Self {
        Self { value }
    }

    pub fn is(&self, value: &i32) -> bool {
        println!("compared I32Value {} == {}", self.value, *value);
        self.value == *value
    }
}
