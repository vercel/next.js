#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn all_in_one() {
    run(&REGISTRATION, || async {
        let a: Vc<u32> = Vc::cell(4242);
        assert_eq!(*a.await?, 4242);

        let a: Vc<MyTransparentValue> = Vc::cell(4242);
        assert_eq!(*a.await?, 4242);

        let b = MyEnumValue::cell(MyEnumValue::More(MyEnumValue::Yeah(42).resolved_cell()));
        assert_eq!(*b.to_string().await?, "42");

        let c = MyStructValue {
            value: 42,
            next: Some(MyStructValue::new(a).to_resolved().await?),
        }
        .into();

        let result = my_function(a, b.get_last(), c, Value::new(MyEnumValue::Yeah(42)));
        assert_eq!(*result.my_trait_function().await?, "42");
        assert_eq!(*result.my_trait_function2().await?, "42");
        assert_eq!(*result.my_trait_function3().await?, "4242");
        assert_eq!(*result.to_string().await?, "42");

        // Testing Vc<Self> in traits

        let a: Vc<Number> = Vc::cell(32);
        let b: Vc<Number> = Vc::cell(10);
        let c: Vc<Number> = a.add(Vc::upcast(b));

        assert_eq!(*c.await?, 42);

        let a_erased: Vc<Box<dyn Add>> = Vc::upcast(a);
        let b_erased: Vc<Box<dyn Add>> = Vc::upcast(b);
        let c_erased: Vc<Box<dyn Add>> = a_erased.add(b_erased);

        assert_eq!(
            *Vc::try_resolve_downcast_type::<Number>(c_erased)
                .await?
                .unwrap()
                .await?,
            42
        );

        let b_erased_other: Vc<Box<dyn Add>> = Vc::upcast(Vc::<NumberB>::cell(10));
        let c_erased_invalid: Vc<Box<dyn Add>> = a_erased.add(b_erased_other);
        assert!(c_erased_invalid.resolve().await.is_err());

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value(transparent, serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
struct MyTransparentValue(u32);

#[turbo_tasks::value(shared, serialization = "auto_for_input")]
#[derive(Debug, Clone, Hash)]
enum MyEnumValue {
    Yeah(u32),
    Nah,
    More(ResolvedVc<MyEnumValue>),
}

#[turbo_tasks::value_impl]
impl MyEnumValue {
    #[turbo_tasks::function]
    pub async fn get_last(self: Vc<Self>) -> Result<Vc<Self>> {
        let mut current = self;
        while let MyEnumValue::More(more) = &*current.await? {
            current = **more;
        }
        Ok(current)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for MyEnumValue {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        match self {
            MyEnumValue::Yeah(value) => Vc::cell(value.to_string().into()),
            MyEnumValue::Nah => Vc::cell("nah".into()),
            MyEnumValue::More(more) => more.to_string(),
        }
    }
}

#[turbo_tasks::value(shared)]
struct MyStructValue {
    value: u32,
    next: Option<ResolvedVc<MyStructValue>>,
}

#[turbo_tasks::value_impl]
impl MyStructValue {
    #[turbo_tasks::function]
    pub async fn new(value: Vc<MyTransparentValue>) -> Result<Vc<Self>> {
        Ok(Self::cell(MyStructValue {
            value: *value.await?,
            next: None,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for MyStructValue {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.value.to_string().into())
    }
}

#[turbo_tasks::value_impl]
impl MyTrait for MyStructValue {
    #[turbo_tasks::function]
    fn my_trait_function2(self: Vc<Self>) -> Vc<RcStr> {
        self.to_string()
    }
    #[turbo_tasks::function]
    async fn my_trait_function3(&self) -> Result<Vc<RcStr>> {
        if let Some(next) = self.next {
            return Ok(next.my_trait_function3());
        }
        Ok(Vc::cell(self.value.to_string().into()))
    }
}

#[turbo_tasks::value_trait]
trait MyTrait: ValueToString {
    // TODO #[turbo_tasks::function]
    async fn my_trait_function(self: Vc<Self>) -> Result<Vc<RcStr>> {
        if *self.to_string().await? != "42" {
            bail!("my_trait_function must only be called with 42 as value")
        }
        // Calling a function twice
        Ok(self.to_string())
    }

    fn my_trait_function2(self: Vc<Self>) -> Vc<RcStr>;
    fn my_trait_function3(self: Vc<Self>) -> Vc<RcStr>;
}

#[turbo_tasks::function]
async fn my_function(
    a: Vc<MyTransparentValue>,
    b: Vc<MyEnumValue>,
    c: Vc<MyStructValue>,
    d: Value<MyEnumValue>,
) -> Result<Vc<MyStructValue>> {
    assert_eq!(*a.await?, 4242);
    assert_eq!(*b.await?, MyEnumValue::Yeah(42));
    assert_eq!(c.await?.value, 42);
    assert_eq!(d.into_value(), MyEnumValue::Yeah(42));
    Ok(c)
}

#[turbo_tasks::value_trait]
trait Add {
    fn add(self: Vc<Self>, other: Vc<Box<dyn Add>>) -> Vc<Self>;
}

#[turbo_tasks::value(transparent)]
struct Number(u32);

#[turbo_tasks::value_impl]
impl Add for Number {
    #[turbo_tasks::function]
    async fn add(self: Vc<Self>, other: Vc<Box<dyn Add>>) -> Result<Vc<Self>> {
        let Some(other) = Vc::try_resolve_downcast_type::<Number>(other).await? else {
            bail!("Expected Number");
        };
        Ok(Vc::cell(*self.await? + *other.await?))
    }
}

#[turbo_tasks::value(transparent)]
struct NumberB(u32);

#[turbo_tasks::value_impl]
impl Add for NumberB {
    #[turbo_tasks::function]
    async fn add(self: Vc<Self>, other: Vc<Box<dyn Add>>) -> Result<Vc<Self>> {
        let Some(other) = Vc::try_resolve_downcast_type::<NumberB>(other).await? else {
            bail!("Expected NumberB");
        };
        Ok(Vc::cell(*self.await? + *other.await?))
    }
}
