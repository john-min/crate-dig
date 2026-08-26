import type { NativeApi } from "../shared/native-api";

declare global {
  interface Window {
    crateDig: NativeApi;
  }
}

export {};
