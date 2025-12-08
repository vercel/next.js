use std::{any::type_name, mem::transmute};

pub use bincode;
use bincode::{
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
};

use crate::{TurboBincodeDecode, TurboBincodeDecoder, TurboBincodeEncode, TurboBincodeEncoder};

#[track_caller]
pub fn encode_for_turbo_bincode_encode_impl<'a, T: TurboBincodeEncode, E: Encoder>(
    value: &T,
    encoder: &'a mut E,
) -> Result<(), EncodeError> {
    let encoder = if unty::type_equal::<E, TurboBincodeEncoder>() {
        // SAFETY: Transmute is safe because `&mut E` is `&mut TurboBincodeEncoder`:
        // - `unty::type_equal::<E, TurboBincodeEncoder>()` does not check lifetimes, but does check
        //   the type and layout, so we know those are correct.
        // - The transmuted encoder cannot escape this function, and we know that the lifetime of
        //   `'a` is at least as long as the function.
        // - Lifetimes don't change layout. This is not strictly guaranteed, but if this assumption
        //   is broken, we'd have a different type id (type ids are derived from layout
        //   information), `type_equal` would return `false`, and we'd panic instead of violating
        //   memory safety.
        // - Two mutable references have the same layout and alignment when they reference exactly
        //   the same type.
        // - The explicit lifetime ('a) avoids creating an implitly unbounded lifetime.
        unsafe { transmute::<&'a mut E, &'a mut TurboBincodeEncoder>(encoder) }
    } else {
        unreachable!(
            "{} implements TurboBincodeEncode, but was called with a {} encoder implementation",
            type_name::<T>(),
            type_name::<E>(),
        )
    };
    TurboBincodeEncode::encode(value, encoder)
}

#[track_caller]
pub fn decode_for_turbo_bincode_decode_impl<
    'a,
    Context,
    T: TurboBincodeDecode<Context>,
    D: Decoder<Context = Context>,
>(
    decoder: &'a mut D,
) -> Result<T, DecodeError> {
    let decoder = if unty::type_equal::<D, TurboBincodeDecoder>() {
        // SAFETY: See notes on the `Encode::encode` implementation on
        // `encode_for_turbo_bincode_encode_impl`.
        unsafe { transmute::<&'a mut D, &'a mut TurboBincodeDecoder<'a>>(decoder) }
    } else {
        unreachable!(
            "{} implements TurboBincodeDecode, but was called with a {} decoder implementation",
            type_name::<T>(),
            type_name::<D>(),
        )
    };
    TurboBincodeDecode::decode(decoder)
}
