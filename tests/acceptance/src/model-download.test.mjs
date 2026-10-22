import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserModel, browserRevision } from '../../../shared/classification.ts';
import { isPinnedModelDownload } from './model-download.mjs';

const origin = 'http://127.0.0.1:5173';
const resolve = `https://huggingface.co/${browserModel}/resolve/${browserRevision}/`;
function request(url, { method = 'GET', body = null, headers = {}, parent = null } = {}) {
  return { url: () => url, method: () => method, postData: () => body, allHeaders: async () => headers, redirectedFrom: () => parent };
}
const allowed = input => isPinnedModelDownload(input, origin);
const text = 'onnx/text_model_quantized.onnx';
const vision = 'onnx/vision_model_quantized.onnx';
const cdnURL = new URL('https://us.aws.cdn.hf.co/xet-bridge-us/65cb5b20a9b7b90d7b5eecd6/cd255f8511954d0877e185294ae7e562684c5e51c2945420174079b65315f1d2?X-Xet-Cas-Uid=public&user_id=public&Expires=1792390582&Policy=download-policy&Signature=download-signature&Key-Pair-Id=download-key&Hash-Algorithm=SHA256');
cdnURL.searchParams.set('response-content-disposition', `inline; filename*=UTF-8''text_model_quantized.onnx; filename="text_model_quantized.onnx";`);
const cdn = cdnURL.href;

test('only the six pinned model asset GETs qualify as downloads', async () => {
  for (const file of ['config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', text, vision]) {
    assert.equal(await allowed(request(resolve + file, { headers: { accept: '*/*', referer: `${origin}/`, origin, 'sec-fetch-mode': 'cors' } })), true, file);
  }
  for (const url of [resolve + 'photo.jpg', resolve.replace(browserRevision, 'main') + 'config.json', resolve + 'config.json?facts=private', resolve + 'config.json#photo', resolve.replace('huggingface.co', 'huggingface.co.example.test') + text, 'https://example.test/photo']) {
    assert.equal(await allowed(request(url)), false, url);
  }
});

test('model URLs cannot carry account, photo or fact payloads', async () => {
  for (const options of [
    { method: 'POST', body: 'photo-bytes' }, { method: 'PUT' }, { method: 'HEAD' }, { body: 'facts' },
    { headers: { authorization: 'Bearer private' } }, { headers: { cookie: 'session=private' } },
    { headers: { 'x-photo': 'photo-bytes' } }, { headers: { accept: 'private-facts' } },
    { headers: { referer: `${origin}/?email=private` } }, { headers: { origin: 'https://example.test' } },
  ]) assert.equal(await allowed(request(resolve + text, options)), false, JSON.stringify(options));
});

test('metadata redirects must belong to the exact pinned file', async () => {
  for (const [file, etag] of [
    ['config.json', 'e79bad158b04c235740f9b2ec320b17f4030f7a5'],
    ['preprocessor_config.json', 'e0675735fd0052745f2f7b7291e4aa7859389998'],
    ['tokenizer.json', 'bc1f77d20440541dd073ebae6f6c401087c7d34e'],
    ['tokenizer_config.json', 'c9b2a711cbdd039529fa5a66f1965e13eb14451d'],
  ]) {
    const url = new URL(`https://huggingface.co/api/resolve-cache/models/${browserModel}/${browserRevision}/${file}`);
    url.searchParams.set(`/${browserModel}/resolve/${browserRevision}/${file}`, '');
    url.searchParams.set('etag', `"${etag}"`);
    const parent = request(resolve + file);
    assert.equal(await allowed(request(url.href, { parent })), true, file);
    assert.equal(await allowed(request(url.href)), false, 'Unrelated cache request');
    url.searchParams.set('photo', 'private');
    assert.equal(await allowed(request(url.href, { parent })), false, 'Extra query payload');
  }
});

test('weight redirects require their pinned source and exact content address', async () => {
  const parent = request(resolve + text);
  assert.equal(await allowed(request(cdn, { parent })), true);
  const visionCdn = cdn.replace('cd255f8511954d0877e185294ae7e562684c5e51c2945420174079b65315f1d2', '7b9594c4274e767d939538c61439b944b37235e1601a3f926bb17f78544e97b1').replaceAll('text_model_quantized', 'vision_model_quantized');
  assert.equal(await allowed(request(visionCdn, { parent: request(resolve + vision) })), true);
  for (const [url, options] of [
    [cdn, {}], [visionCdn, { parent }], [cdn + '&photo=private', { parent }], [cdn + '&user_id=private', { parent }],
    [cdn.replace('us.aws.cdn.hf.co', 'example.test'), { parent }],
    [cdn, { parent: request(resolve + text, { body: 'private' }) }],
    [cdn, { parent, method: 'POST', body: 'photo-bytes' }],
    [cdn, { parent, headers: { authorization: 'Bearer private' } }],
  ]) assert.equal(await allowed(request(url, options)), false, url);
});
