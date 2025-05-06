#![feature(proc_macro_diagnostic)]
#![feature(box_patterns)]

mod expand;
mod generic_type_input;
mod ident;
mod primitive_input;
mod self_filter;
mod value_trait_arguments;

pub use expand::*;
pub use generic_type_input::GenericTypeInput;
pub use ident::*;
pub use primitive_input::PrimitiveInput;
pub use self_filter::is_self_used;
pub use value_trait_arguments::ValueTraitArguments;
