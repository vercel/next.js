use anyhow::Result;
use turbopack_create_test_app::test_app_builder::TestAppBuilder;

fn main() -> Result<()> {
    println!("{}", TestAppBuilder { module_count: 10 }.build()?.display());

    Ok(())
}
