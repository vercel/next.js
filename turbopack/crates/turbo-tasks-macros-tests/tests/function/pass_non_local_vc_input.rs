#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(dead_code)]

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};

#[derive(Clone)]
#[turbo_tasks::value(non_local)]
struct ExampleStruct {
    items: Vec<ResolvedVc<u32>>,
}

#[turbo_tasks::value_impl]
impl ExampleStruct {
    #[turbo_tasks::function]
    fn constructor_one(item: ResolvedVc<u32>) -> Vc<Self> {
        ExampleStruct { items: vec![item] }.cell()
    }

    #[turbo_tasks::function]
    fn constructor_vec(items: Vec<turbo_tasks::ResolvedVc<u32>>) -> Vc<Self> {
        ExampleStruct { items }.cell()
    }

    #[turbo_tasks::function]
    fn method_with_resolved_vc_self(self: ResolvedVc<Self>) {
        // inner methods using `self` are unaffected
        struct InnerImpl;
        impl InnerImpl {
            fn inner_method(&self) {
                let _: &InnerImpl = self;
            }
        }

        let _: ResolvedVc<Self> = self;
    }
}

impl ExampleStruct {
    fn non_turbo_method_with_resolved_vc_self(self: ResolvedVc<Self>) {}
}

#[turbo_tasks::value(non_local, transparent)]
struct MaybeExampleStruct(Option<ExampleStruct>);

#[turbo_tasks::function]
async fn caller_uses_unresolved_vc(items: Option<Vec<Vc<u32>>>) -> Result<Vc<MaybeExampleStruct>> {
    if let Some(items) = items {
        // call `constructor_vec` with `Vc` (not `ResolvedVc`)
        let inner = ExampleStruct::constructor_vec(items).await?;
        Ok(Vc::cell(Some((*inner).clone())))
    } else {
        Ok(Vc::cell(None))
    }
}

fn main() {}
