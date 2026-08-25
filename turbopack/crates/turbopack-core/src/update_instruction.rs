use std::{any::Any, fmt::Debug, sync::Arc};

use serde::Serialize;
use turbo_tasks::{
    NonLocalValue,
    debug::ValueDebugFormat,
    trace::{TraceRawVcs, TraceRawVcsContext},
};

trait ErasedUpdateInstruction:
    erased_serde::Serialize + Debug + Send + Sync + NonLocalValue + 'static
{
    fn as_any(&self) -> &dyn Any;
    fn dyn_eq(&self, other: &dyn Any) -> bool;
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext);
}

impl<T> ErasedUpdateInstruction for T
where
    T: Serialize + Eq + Debug + Send + Sync + NonLocalValue + TraceRawVcs + 'static,
{
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn dyn_eq(&self, other: &dyn Any) -> bool {
        other.downcast_ref::<Self>() == Some(self)
    }

    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        TraceRawVcs::trace_raw_vcs(self, trace_context);
    }
}

erased_serde::serialize_trait_object!(ErasedUpdateInstruction);

#[derive(Clone, Debug, Serialize, ValueDebugFormat, NonLocalValue)]
#[serde(transparent)]
pub struct UpdateInstruction(Arc<dyn ErasedUpdateInstruction>);

impl PartialEq for UpdateInstruction {
    fn eq(&self, other: &Self) -> bool {
        self.0.dyn_eq(other.0.as_any())
    }
}

impl Eq for UpdateInstruction {}

impl UpdateInstruction {
    pub fn new<T>(instruction: T) -> Self
    where
        T: Serialize + Eq + Debug + Send + Sync + NonLocalValue + TraceRawVcs + 'static,
    {
        Self(Arc::new(instruction))
    }

    pub fn downcast_ref<T: 'static>(&self) -> Option<&T> {
        self.0.as_any().downcast_ref()
    }
}

impl TraceRawVcs for UpdateInstruction {
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        ErasedUpdateInstruction::trace_raw_vcs(self.0.as_ref(), trace_context);
    }
}

#[cfg(test)]
mod tests {
    use serde::Serialize;
    use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

    use super::UpdateInstruction;

    #[derive(Debug, PartialEq, Eq, Serialize, TraceRawVcs, NonLocalValue)]
    struct TestInstruction {
        value: u32,
    }

    #[test]
    fn serializes_without_an_extra_wrapper() {
        let instruction = UpdateInstruction::new(TestInstruction { value: 42 });

        assert_eq!(
            serde_json::to_value(&instruction).unwrap(),
            serde_json::json!({ "value": 42 })
        );
    }

    #[test]
    fn downcasts_by_concrete_type() {
        let instruction = UpdateInstruction::new(TestInstruction { value: 42 });

        assert_eq!(
            instruction
                .downcast_ref::<TestInstruction>()
                .map(|instruction| instruction.value),
            Some(42)
        );
        assert_eq!(
            instruction,
            UpdateInstruction::new(TestInstruction { value: 42 })
        );
    }
}
