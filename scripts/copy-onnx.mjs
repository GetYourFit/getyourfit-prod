import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('public/onnx', { recursive: true });
for (const file of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  await copyFile(`node_modules/@huggingface/transformers/dist/${file}`, `public/onnx/${file}`);
}
