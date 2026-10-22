import { browserModel, browserRevision } from '../../../shared/classification.ts';

const resolve = `https://huggingface.co/${browserModel}/resolve/${browserRevision}/`;
const metadata = new Map([
  ['config.json', 'e79bad158b04c235740f9b2ec320b17f4030f7a5'],
  ['preprocessor_config.json', 'e0675735fd0052745f2f7b7291e4aa7859389998'],
  ['tokenizer.json', 'bc1f77d20440541dd073ebae6f6c401087c7d34e'],
  ['tokenizer_config.json', 'c9b2a711cbdd039529fa5a66f1965e13eb14451d'],
]);
const weights = new Map([
  ['onnx/text_model_quantized.onnx', 'cd255f8511954d0877e185294ae7e562684c5e51c2945420174079b65315f1d2'],
  ['onnx/vision_model_quantized.onnx', '7b9594c4274e767d939538c61439b944b37235e1601a3f926bb17f78544e97b1'],
]);
const assets = [...metadata.keys(), ...weights.keys()];

async function payloadFree(request, appOrigin) {
  if (request.method() !== 'GET' || request.postData() !== null) return false;
  const headers = await request.allHeaders();
  const standard = ['accept', 'accept-encoding', 'accept-language', 'user-agent', 'origin', 'referer', 'priority', 'cache-control', 'pragma'];
  return Object.keys(headers).every(name => standard.includes(name) || name.startsWith('sec-'))
    && (!headers.accept || headers.accept === '*/*')
    && (!headers.origin || headers.origin === appOrigin)
    && (!headers.referer || headers.referer === `${appOrigin}/`);
}

export async function isPinnedModelDownload(request, appOrigin) {
  if (!await payloadFree(request, appOrigin)) return false;
  if (assets.some(file => request.url() === resolve + file)) return true;
  const parent = request.redirectedFrom();
  const file = parent && assets.find(file => parent.url() === resolve + file);
  if (!file || !await payloadFree(parent, appOrigin)) return false;
  const url = new URL(request.url());
  if (url.username || url.password || url.hash) return false;
  if (metadata.has(file)) {
    return url.origin === 'https://huggingface.co'
      && url.pathname === `/api/resolve-cache/models/${browserModel}/${browserRevision}/${file}`
      && [...url.searchParams].length === 2
      && url.searchParams.get(`/${browserModel}/resolve/${browserRevision}/${file}`) === ''
      && url.searchParams.get('etag') === `"${metadata.get(file)}"`;
  }
  return url.origin === 'https://us.aws.cdn.hf.co'
    && url.pathname === `/xet-bridge-us/65cb5b20a9b7b90d7b5eecd6/${weights.get(file)}`
    && new Set(url.searchParams.keys()).size === [...url.searchParams].length
    && [...url.searchParams.keys()].every(key => ['xip', 'X-Xet-Cas-Uid', 'response-content-disposition', 'user_id', 'Expires', 'Policy', 'Signature', 'Key-Pair-Id', 'Hash-Algorithm'].includes(key))
    && url.searchParams.get('response-content-disposition') === `inline; filename*=UTF-8''${file.slice(5)}; filename="${file.slice(5)}";`
    && url.searchParams.get('X-Xet-Cas-Uid') === 'public'
    && url.searchParams.get('user_id') === 'public';
}
