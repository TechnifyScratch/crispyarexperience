import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const destination = resolve("public/vendor/vision");
await mkdir(destination, { recursive: true });
for (const name of ["tfjs-backend-wasm.wasm", "tfjs-backend-wasm-simd.wasm", "tfjs-backend-wasm-threaded-simd.wasm"]) {
  await copyFile(resolve("node_modules/@tensorflow/tfjs-backend-wasm/dist", name), resolve(destination, name));
}
