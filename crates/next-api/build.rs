fn main() -> anyhow::Result<()> {
    // Generates, stores build-time information as static values.
    // There are some places relying on correct values for this (i.e telemetry),
    // So failing build if this fails.
    let cargo = vergen::CargoBuilder::default()
        .target_triple(true)
        .build()?;
    vergen::Emitter::default()
        .add_instructions(&cargo)?
        .fail_on_error()
        .emit()?;

    Ok(())
}
