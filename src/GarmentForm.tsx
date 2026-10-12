import { useState } from 'react';
import { z } from 'zod';
import { categorySchema, dressCodeSchema, factsSchema, garmentSchema, interpretationSchema, weatherSchema, type Facts, type Garment, type Interpretation } from '../shared/wardrobe';
import { wardrobeRequest } from './wardrobe-api';

type PhotoState = { kind: 'empty' } | { kind: 'processing' } | { kind: 'ready'; image: string; interpretation: Interpretation };
export function GarmentForm({ garment, onSaved, onCancel }: { garment: Garment | null; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'empty' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const defaults = garment?.facts;

  async function review(file: File | undefined) {
    setPhoto({ kind: 'empty' });
    setError('');
    if (!file || !consent) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) {
      setError('Choose a JPEG, PNG, or WebP photo under 10 MB.'); return;
    }
    setPhoto({ kind: 'processing' });
    let image: string;
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 16_000_000) throw new Error('too-large');
        const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas-unavailable');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        if (image.length > 1_333_336) throw new Error('too-large');
      } finally { bitmap.close(); }
    } catch {
      setError('This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.');
      setPhoto({ kind: 'empty' }); return;
    }
    try {
      const interpretation = await wardrobeRequest('/review', interpretationSchema, { consent: true, image });
      setPhoto({ kind: 'ready', image, interpretation });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Photo review failed. Try again.');
      setPhoto({ kind: 'empty' });
    }
  }

  async function save(form: HTMLFormElement) {
    const data = new FormData(form);
    const parsed = factsSchema.safeParse({ name: data.get('name'), category: data.get('category'), color: data.get('color'), size: data.get('size'),
      owned: data.get('owned') === 'on', available: data.get('available') === 'on', fit: data.get('fit'), weather: data.getAll('weather'), dressCode: data.getAll('dressCode') });
    if (!parsed.success) { setError('Confirm ownership and all details, including at least one weather and dress code.'); return; }
    if (!garment && (!consent || photo.kind !== 'ready')) { setError('Confirm permission and review a real photo first.'); return; }
    setBusy(true); setError('');
    try {
      if (garment) await wardrobeRequest(`/${garment.id}`, garmentSchema, parsed.data, 'PATCH');
      else if (photo.kind === 'ready') await wardrobeRequest('', garmentSchema, { facts: parsed.data, consent: true, image: photo.image });
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The garment could not be saved.'); }
    finally { setBusy(false); }
  }

  return <section className="garment-editor" aria-labelledby="garment-form-title">
    <div className="section-heading"><div><p className="eyebrow">{garment ? 'YOUR CORRECTION WINS' : 'ONE REAL GARMENT'}</p><h2 id="garment-form-title">{garment ? `Edit ${garment.facts.name}` : 'Start with a photo.'}</h2></div><button className="text-button" onClick={onCancel} disabled={busy || photo.kind === 'processing'}>Cancel</button></div>
    {!garment && <div className="photo-step">
      <label className="consent-check"><input type="checkbox" checked={consent} disabled={photo.kind === 'processing' || busy} onChange={(event) => { setConsent(event.target.checked); setPhoto({ kind: 'empty' }); }} />I own this garment and have permission to use its photo. I consent to processing and storing it on this device, without sharing or model training.</label>
      <label className="photo-upload"><span>Review photo on this device</span><input type="file" aria-label="Garment photo" accept="image/jpeg,image/png,image/webp" disabled={!consent || busy || photo.kind === 'processing'} onChange={(event) => { void review(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <p className="form-note" role="status">{photo.kind === 'processing' ? 'Resizing in your browser, then checking with local Apple Vision…' : 'JPEG, PNG, or WebP, up to 10 MB and 16 megapixels. Resized to 1200 px and stripped of metadata before local review. Nothing is sent to an external service.'}</p>
      {photo.kind === 'ready' && <div className="photo-review"><img src={`data:image/jpeg;base64,${photo.image}`} alt="Your resized garment photo" /><InterpretationNote interpretation={photo.interpretation} /><p>Your choices below are the facts used for outfits. A photo cannot establish fit, ownership, weather, or dress code.</p></div>}
    </div>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <form className="garment-form" onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget); }}>
      <fieldset disabled={busy || (!garment && photo.kind !== 'ready')}>
        <legend>Confirm your garment facts</legend>
        <div className="form-grid">
          <label>Name<input className="text-input" name="name" maxLength={80} required defaultValue={defaults?.name ?? ''} placeholder="A name you recognize" /></label>
          <label>Category<select className="text-input" name="category" required defaultValue={defaults?.category ?? ''}><option value="" disabled>Choose a category</option>{categorySchema.options.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Color<input className="text-input" name="color" maxLength={40} required defaultValue={defaults?.color ?? ''} /></label>
          <label>Size on label<input className="text-input" name="size" maxLength={40} required defaultValue={defaults?.size ?? ''} placeholder="Use unknown if there is no label" /></label>
          <label>Does it fit you now?<select className="text-input" name="fit" defaultValue={defaults?.fit ?? 'unknown'}><option value="unknown">I’m not sure</option><option value="fits">Yes, it fits</option><option value="does-not-fit">No, it does not fit</option></select></label>
        </div>
        <FactOptions name="weather" title="Weather you would wear it in" values={weatherSchema.options} selected={defaults?.weather ?? []} />
        <FactOptions name="dressCode" title="Dress codes you would wear it for" values={dressCodeSchema.options} selected={defaults?.dressCode ?? []} />
        <label className="consent-check"><input type="checkbox" name="available" defaultChecked={defaults?.available ?? true} />Available to wear now</label>
        <label className="consent-check"><input type="checkbox" name="owned" defaultChecked={defaults?.owned ?? false} required />I confirm this garment is mine and these are my facts.</label>
        <p className="form-note">Recorded as {garment ? 'wearer corrections' : 'confirmed by you'}, with no model version. Confidence 1 means you explicitly confirmed the fact; it is not an AI score.</p>
        <button className="button button-primary" type="submit">{busy ? 'Saving…' : garment ? 'Save correction' : 'Save garment'}</button>
      </fieldset>
    </form>
  </section>;
}

function FactOptions({ name, title, values, selected }: { name: keyof Pick<Facts, 'weather' | 'dressCode'>; title: string; values: readonly string[]; selected: readonly string[] }) {
  return <fieldset className="fact-options"><legend>{title}</legend>{values.map((value) => <label key={value}><input type="checkbox" name={name} value={value} defaultChecked={selected.includes(value)} />{value}</label>)}</fieldset>;
}

export function InterpretationNote({ interpretation }: { interpretation: z.infer<typeof interpretationSchema> }) {
  if (interpretation.kind === 'unavailable') return <p className="form-note">{interpretation.reason === 'no-clothing-label' ? 'No clothing label was recognized.' : 'Local image classification is unavailable.'} Confirm the details yourself; no confidence score has been invented.</p>;
  return <p className="form-note">Photo label: <strong>{interpretation.label}</strong> · {(interpretation.confidence * 100).toFixed(1)}% classifier score.<br />{interpretation.source} · {interpretation.modelVersion}. This score is uncertain and does not measure fit or style. Which category is this garment? Confirm it below.</p>;
}
