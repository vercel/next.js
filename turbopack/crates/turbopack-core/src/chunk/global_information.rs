#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub struct GlobalInformation {}

#[turbo_tasks::value(transparent)]
pub struct OptionGlobalInformation(Option<GlobalInformation>);
