#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc, read};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_all_in_one() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        // pass a nonce to re-run the test body on every turbo-tasks restart
        nonce += 1;
        async move {
            test_all_in_one_operation(nonce)
                .read_strongly_consistent()
                .await
        }
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation, root)]
async fn test_all_in_one_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce; // ensure the nonce is part of our cache key

    let a: Vc<u32> = Vc::cell(4242);
    assert_eq!(*read!(a)?, 4242);

    let a: Vc<MyTransparentValue> = Vc::cell(4242);
    assert_eq!(*read!(a)?, 4242);

    let b = MyEnumValue::cell(MyEnumValue::More(MyEnumValue::Yeah(42).resolved_cell()));
    assert_eq!(*read!(b.to_string())?, "42");

    let c = MyStructValue {
        value: 42,
        next: Some(read!(MyStructValue::new(a).to_resolved())?),
    }
    .cell();

    let result = my_function(a, b.get_last(), c, MyEnumValue::Yeah(42));
    assert_eq!(*read!(result.my_trait_function())?, "42");
    assert_eq!(*read!(result.my_trait_function2())?, "42");
    assert_eq!(*read!(result.my_trait_function3())?, "4242");
    assert_eq!(*read!(result.to_string())?, "42");

    // Testing Vc<Self> in traits

    let a: Vc<Number> = Vc::cell(32);
    let b: Vc<Number> = Vc::cell(10);
    let c: Vc<Number> = a.add(Vc::upcast(b));

    assert_eq!(*read!(c)?, 42);

    let a_erased: Vc<Box<dyn Add>> = Vc::upcast(a);
    let b_erased: Vc<Box<dyn Add>> = Vc::upcast(b);
    let c_erased: Vc<Box<dyn Add>> = a_erased.add(b_erased);

    assert_eq!(
        *read!(ResolvedVc::try_downcast_type::<Number>(read!(c_erased.to_resolved())?).unwrap())?,
        42
    );

    let b_erased_other: Vc<Box<dyn Add>> = Vc::upcast(Vc::<NumberB>::cell(10));
    let c_erased_invalid: Vc<Box<dyn Add>> = a_erased.add(b_erased_other);
    assert!(read!(c_erased_invalid.to_resolved()).is_err());

    Ok(Vc::cell(()))
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone, Hash)]
struct MyTransparentValue(u32);

#[turbo_tasks::value(shared, task_input)]
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
        while let MyEnumValue::More(more) = &*read!(current)? {
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
            MyEnumValue::Nah => Vc::cell(rcstr!("nah")),
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
            value: *read!(value)?,
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
    fn my_trait_function3(&self) -> Result<Vc<RcStr>> {
        if let Some(next) = self.next {
            return Ok(next.my_trait_function3());
        }
        Ok(Vc::cell(self.value.to_string().into()))
    }
}

#[turbo_tasks::value_trait]
trait MyTrait: ValueToString {
    #[turbo_tasks::function]
    async fn my_trait_function(self: Vc<Self>) -> Result<Vc<RcStr>> {
        if *read!(self.to_string())? != "42" {
            bail!("my_trait_function must only be called with 42 as value")
        }
        // Calling a function twice
        Ok(self.to_string())
    }

    #[turbo_tasks::function]
    fn my_trait_function2(self: Vc<Self>) -> Vc<RcStr>;
    #[turbo_tasks::function]
    fn my_trait_function3(self: Vc<Self>) -> Vc<RcStr>;
}

#[turbo_tasks::function]
async fn my_function(
    a: Vc<MyTransparentValue>,
    b: Vc<MyEnumValue>,
    c: Vc<MyStructValue>,
    d: MyEnumValue,
) -> Result<Vc<MyStructValue>> {
    assert_eq!(*read!(a)?, 4242);
    assert_eq!(*read!(b)?, MyEnumValue::Yeah(42));
    assert_eq!(read!(c)?.value, 42);
    assert_eq!(d, MyEnumValue::Yeah(42));
    Ok(c)
}

#[turbo_tasks::value_trait]
trait Add {
    #[turbo_tasks::function]
    fn add(self: Vc<Self>, other: Vc<Box<dyn Add>>) -> Vc<Self>;
}

#[turbo_tasks::value(transparent)]
struct Number(u32);

#[turbo_tasks::value_impl]
impl Add for Number {
    #[turbo_tasks::function]
    async fn add(self: Vc<Self>, other: ResolvedVc<Box<dyn Add>>) -> Result<Vc<Self>> {
        let Some(other) = ResolvedVc::try_downcast_type::<Number>(other) else {
            bail!("Expected Number");
        };
        Ok(Vc::cell(*read!(self)? + *read!(other)?))
    }
}

#[turbo_tasks::value(transparent)]
struct NumberB(u32);

#[turbo_tasks::value_impl]
impl Add for NumberB {
    #[turbo_tasks::function]
    async fn add(self: Vc<Self>, other: ResolvedVc<Box<dyn Add>>) -> Result<Vc<Self>> {
        let Some(other) = ResolvedVc::try_downcast_type::<NumberB>(other) else {
            bail!("Expected NumberB");
        };
        Ok(Vc::cell(*read!(self)? + *read!(other)?))
    }
}
