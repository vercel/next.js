#![doc = include_str!("../README.md")]

mod frame;
mod highlight;

pub use frame::{
    CodeFrameColorMode, CodeFrameLocation, CodeFrameOptions, Location, render_code_frame,
};
pub use highlight::Language;

#[cfg(test)]
mod tests;
