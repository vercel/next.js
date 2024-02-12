export interface EncodeOptions {
  quality: number
  target_size: number
  target_PSNR: number
  method: number
  sns_strength: number
  filter_strength: number
  filter_sharpness: number
  filter_type: number
  partitions: number
  segments: number
  pass: number
  show_compressed: number
  preprocessing: number
  autofilter: number
  partition_limit: number
  alpha_compression: number
  alpha_filtering: number
  alpha_quality: number
  lossless: number
  exact: number
  image_hint: number
  emulate_jpeg_size: number
  thread_level: number
  low_memory: number
  near_lossless: number
  use_delta_palette: number
  use_sharp_yuv: number
}

export interface WebPModule extends EmscriptenWasm.Module {
  encode(
    data: BufferSource,
    width: number,
    height: number,
    options: EncodeOptions
  ): Uint8Array
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<WebPModule>

export default moduleFactory
