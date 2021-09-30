// eslint-disable-next-line no-shadow
export const enum AVIFTune {
  auto,
  psnr,
  ssim,
}

export interface EncodeOptions {
  cqLevel: number
  denoiseLevel: number
  cqAlphaLevel: number
  tileRowsLog2: number
  tileColsLog2: number
  speed: number
  subsample: number
  chromaDeltaQ: boolean
  sharpness: number
  tune: AVIFTune
}

export interface AVIFModule extends EmscriptenWasm.Module {
  encode(
    data: BufferSource,
    width: number,
    height: number,
    options: EncodeOptions
  ): Uint8Array
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<AVIFModule>

export default moduleFactory
