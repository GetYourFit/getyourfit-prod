# On-device garment recognition

Photo review runs in a dedicated browser worker using [Transformers.js](https://huggingface.co/docs/transformers.js/) and the MIT-licensed [ff13/fashion-clip ONNX conversion](https://huggingface.co/ff13/fashion-clip), derived from [FashionCLIP](https://huggingface.co/patrickjohncyh/fashion-clip). `shared/classification.ts` pins the model revision, quantization, and candidate labels. The MIT-licensed ONNX Runtime WASM files come from the locked npm dependency and are copied to the app's own origin during `prebuild` and `predev`. No paid inference service, GPU server, API key, or per-photo charge is needed.

The worker uses single-threaded CPU/WASM on every platform. WebGPU and cross-origin isolation are unnecessary. First use downloads about 154 MB of quantized weights plus tokenizer/configuration files from Hugging Face, as well as about 22 MB of WASM from this app. The browser may cache model files in Cache Storage. Storage eviction, private browsing, device memory limits, regional access restrictions, or unavailable model hosting can prevent recognition. Model downloads reveal normal request metadata, including the IP address, to the model host. They contain no photo, account, or garment facts.

The browser decodes the photo, strips metadata, and resizes it before recognition. It passes JPEG bytes directly to the worker. Reviewing does not upload the photo. Saving uploads the resized JPEG, confirmed garment facts, and the browser-reported model result to the wearer's private account. The server validates and stores that result as client-reported provenance; it is not server attestation that inference occurred. Wearer facts retain separate confirmation provenance.

Recognition never selects a category or supplies ownership, fit, weather, dress code, or style judgments. The candidate labels cover shirts, sweaters, coats, trousers, shorts, skirts, dresses, jumpsuits, and footwear, plus a non-clothing alternative. Scores below 0.4 and the non-clothing alternative yield no clothing label. This is a conservative heuristic, not calibrated probability or a guarantee against out-of-distribution photos.

Manual fact entry is available as soon as the resized preview is ready. **Skip recognition and confirm manually** terminates the worker and its download. A five-minute recognition deadline, worker errors, and unsupported browsers expose the same manual path without invented scores. Selecting another photo, withdrawing consent, leaving the form, or saving terminates in-flight recognition. A skipped download may need to start again next time.

Apple Vision remains an optional server-local path: start the server with `GYF_CLASSIFIER=apple-vision` on macOS with Swift, then use the authenticated `/api/wardrobe/review` endpoint with photo permission. API clients that omit a browser interpretation when saving also use that path. The default browser flow does not invoke Apple Vision, and Linux never needs Swift.

## Verify recognition

Run `GYF_PROOF_DIR=/absolute/scratch/path npm run verify:classification`. It builds and starts an isolated production service, drives Chrome through `chrome-devtools-axi`, with a dedicated Chrome profile. A Playwright init script removes `navigator.gpu` before app code when the verifier opens `?recognition-test=wasm`; the product forces CPU/WASM on all requests. A separate inference runs with WebGPU present. Install the acceptance browser dependencies first with `npm ci --prefix tests/acceptance` and `npx --prefix tests/acceptance playwright install chromium`. It measures the four real, licensed photographs in [the fixture licence record](../tests/fixtures/README.md), one per wardrobe category. It checks that review does not call the upload endpoint, that low-bandwidth users can skip and enter facts, that recognition deadlines and worker failures allow manual saving, and that a client cannot claim Apple Vision provenance.

This four-image set is an acceptance smoke test, not a representative accuracy benchmark. It does not establish recognition quality across countries, styles, lighting, clutter, multiple garments, or devices. A wrong confident label remains possible and requires wearer correction. The machine-readable report contains the actual labels and scores, expected labels, and correctness for each photo. Record observed results here only after running the verifier.

## Measured photo sample

On 2026-10-19, the production browser path with WebGPU removed produced the expected garment label for 3 of 4 fixture photographs (75%). Each photo was decoded and classified by the pinned quantized model; labels were compared with the fixture's garment, without mocking inference. This is one four-image evaluation, not a population accuracy estimate. Repeated verification runs reproduced the same three matches and the trouser error. No threshold or candidate label was changed to hide that error.

| Fixture | Expected | Observed label | Observed score | Match |
| --- | --- | --- | --- | --- |
| top.jpg | Shirt | Shirt or T-shirt | 97.8% | Yes |
| bottom.jpg | Trousers | Jacket or coat | 48.0% | No |
| footwear.jpg | Footwear | Shoes or sandals | 100.0% | Yes |
| one-piece.jpg | Dress | Dress | 92.3% | Yes |

Scores are rounded model outputs, not measured correctness probabilities. Even the displayed 100.0% does not guarantee correctness. The trouser failure is why categories remain explicitly wearer-confirmed. Recognition acceptance requires real inference and working recovery, while this accuracy sample reports its mistakes without an assumed pass percentage.
