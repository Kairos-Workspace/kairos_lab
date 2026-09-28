import type { QuantifyApi } from './index'

declare global {
  interface Window {
    kairos?: QuantifyApi
    quantify: QuantifyApi
    aureum?: QuantifyApi
  }
}

export {}
