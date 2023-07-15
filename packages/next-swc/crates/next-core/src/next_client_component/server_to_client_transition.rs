use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        context::AssetContext,
        module::Module,
        reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
        source::Source,
    },
    turbopack::{transition::Transition, ModuleAssetContext},
};

use crate::embed_js::next_asset;

#[turbo_tasks::value(shared)]
pub struct NextServerToClientTransition {
    pub ssr: bool,
}

#[turbo_tasks::value_impl]
impl Transition for NextServerToClientTransition {
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        context: Vc<ModuleAssetContext>,
        _reference_type: Value<ReferenceType>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        let context = self.process_context(context);
        let client_chunks = context.with_transition("next-client-chunks").process(
            source,
            Value::new(ReferenceType::Entry(
                EntryReferenceSubType::AppClientComponent,
            )),
        );

        Ok(match this.ssr {
            true => {
                let internal_source = next_asset("entry/app/server-to-client-ssr.tsx");
                let client_module = context.with_transition("next-ssr-client-module").process(
                    source,
                    Value::new(ReferenceType::Entry(
                        EntryReferenceSubType::AppClientComponent,
                    )),
                );
                context.process(
                    internal_source,
                    Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                        "CLIENT_MODULE".to_string() => client_module.into(),
                        "CLIENT_CHUNKS".to_string() => client_chunks.into(),
                    }))),
                )
            }
            false => {
                let internal_source = next_asset("entry/app/server-to-client.tsx");
                context.process(
                    internal_source,
                    Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                        "CLIENT_CHUNKS".to_string() => client_chunks.into(),
                    }))),
                )
            }
        })
    }
}
