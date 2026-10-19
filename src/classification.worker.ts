import { env, pipeline, RawImage } from '@huggingface/transformers';
import { browserModel, browserRevision, garmentLabels, browserInterpretationSchema } from '../shared/classification';

env.allowLocalModels = false;
const wasm = env.backends.onnx.wasm;
if (!wasm) throw new Error('WASM backend unavailable');
wasm.wasmPaths = '/onnx/';
wasm.numThreads = 1;
wasm.proxy = false;

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const classify = await pipeline('zero-shot-image-classification', browserModel, {
      revision: browserRevision, device: 'wasm', dtype: 'q8',
      progress_callback: (progress) => {
        if (progress.status === 'progress') self.postMessage({ kind: 'progress', message: `Downloading recognition model: ${Math.round(progress.progress)}% of ${progress.file}` });
      },
    });
    self.postMessage({ kind: 'progress', message: 'Recognizing your garment on this device…' });
    const image = await RawImage.fromBlob(event.data);
    const results = await classify(image, [...garmentLabels, 'a photo of something other than clothing'], { hypothesis_template: '{}' });
    const first = results[0];
    const best = Array.isArray(first) ? first[0] : first;
    const interpretation = browserInterpretationSchema.safeParse({ kind: 'classified', source: 'FashionCLIP (on-device)',
      modelVersion: `${browserModel}@${browserRevision}/q8`, label: best?.label, confidence: best?.score });
    self.postMessage(interpretation.success && interpretation.data.kind === 'classified' && interpretation.data.confidence >= 0.4
      ? interpretation.data : { kind: 'unavailable', reason: 'no-clothing-label' });
  } catch (error) {
    console.warn('On-device garment recognition failed', error instanceof Error ? error.message : 'Inference error');
    self.postMessage({ kind: 'unavailable', reason: 'classification-failed' });
  }
};
