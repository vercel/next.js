#![feature(min_specialization)]

use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_testing::{register, run};

register!();

#[tokio::test]
async fn all_in_one() {
    run! {
        let a = MyTransparentValueVc::cell(4242);
        assert_eq!(*a.await?, 4242);

        let b = MyEnumValueVc::cell(MyEnumValue::More(MyEnumValue::Yeah(42).into()));
        assert_eq!(*b.to_string().await?, "42");

        let c = MyStructValue {
            value: 42,
            next: Some(MyStructValueVc::new(a)),
        }
        .into();

        let result = my_function(a, b.get_last(), c, Value::new(MyEnumValue::Yeah(42)));
        assert_eq!(*result.my_trait_function().await?, "42");
        assert_eq!(*result.my_trait_function2().await?, "42");
        assert_eq!(*result.my_trait_function3().await?, "4242");
        assert_eq!(*result.to_string().await?, "42");
    }
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
struct MyTransparentValue(u32);

#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(Debug, Clone, PartialOrd, Ord, Hash)]
enum MyEnumValue {
    Yeah(u32),
    Nah,
    More(MyEnumValueVc),
}

#[turbo_tasks::value_impl]
impl MyEnumValueVc {
    #[turbo_tasks::function]
    pub async fn get_last(self) -> Result<Self> {
        let mut current = self;
        while let MyEnumValue::More(more) = &*current.await? {
            current = *more;
        }
        Ok(current)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for MyEnumValue {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        match self {
            MyEnumValue::Yeah(value) => StringVc::cell(value.to_string()),
            MyEnumValue::Nah => StringVc::cell("nah".to_string()),
            MyEnumValue::More(more) => more.to_string(),
        }
    }
}

#[turbo_tasks::value(shared)]
struct MyStructValue {
    value: u32,
    next: Option<MyStructValueVc>,
}

#[turbo_tasks::value_impl]
impl MyStructValueVc {
    #[turbo_tasks::function]
    pub async fn new(value: MyTransparentValueVc) -> Result<Self> {
        Ok(Self::cell(MyStructValue {
            value: *value.await?,
            next: None,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for MyStructValue {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        StringVc::cell(self.value.to_string())
    }
}

#[turbo_tasks::value_impl]
impl MyTrait for MyStructValue {
    #[turbo_tasks::function]
    fn my_trait_function2(self_vc: MyStructValueVc) -> StringVc {
        self_vc.to_string()
    }
    #[turbo_tasks::function]
    async fn my_trait_function3(&self) -> Result<StringVc> {
        if let Some(next) = self.next {
            return Ok(next.my_trait_function3());
        }
        Ok(StringVc::cell(self.value.to_string()))
    }
}

#[turbo_tasks::value_trait]
trait MyTrait: ValueToString {
    // TODO #[turbo_tasks::function]
    async fn my_trait_function(self_vc: MyTraitVc) -> Result<StringVc> {
        if *self_vc.to_string().await? != "42" {
            return Err(anyhow!(
                "my_trait_function must only be called with 42 as value"
            ));
        }
        // Calling a function twice
        Ok(self_vc.to_string())
    }

    fn my_trait_function2(&self) -> StringVc;
    fn my_trait_function3(&self) -> StringVc;
}

#[turbo_tasks::function]
async fn my_function(
    a: MyTransparentValueVc,
    b: MyEnumValueVc,
    c: MyStructValueVc,
    d: Value<MyEnumValue>,
) -> Result<MyStructValueVc> {
    assert_eq!(*a.await?, 4242);
    assert_eq!(*b.await?, MyEnumValue::Yeah(42));
    assert_eq!(c.await?.value, 42);
    assert_eq!(d.into_value(), MyEnumValue::Yeah(42));
    Ok(c)
}
