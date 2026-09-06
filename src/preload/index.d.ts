import type { QuantifyApi } from './index'

declare global {
  interface Window {
    quantify: QuantifyApi
    aureum?: QuantifyApi
  }
}

export {}
