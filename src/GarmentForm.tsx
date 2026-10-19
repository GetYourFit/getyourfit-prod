import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { z } from 'zod';
import { ImagePlus, X } from 'lucide-react';
import { categorySchema, dressCodeSchema, factsSchema, garmentSchema, interpretationSchema, weatherSchema, type Facts, type Garment, type Interpretation } from '../shared/wardrobe';
import { wardrobeRequest } from './wardrobe-api';
import { categoryLabel, dressCodeLabel, weatherLabel } from './labels';
import { Field, Notice } from './ui';
import { reviewOnDevice } from './classification';

type PhotoState = { kind: 'empty' } | { kind: 'processing' } | { kind: 'ready'; image: string; interpretation: Interpretation };

export function GarmentForm({ garment, onSaved, onCancel }: { garment: Garment | null; onSaved: (saved: Garment) => Promise<void>; onCancel: () => void }) {
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'empty' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recognition, setRecognition] = useState('');
  const cancelRecognition = useRef<() => void>(() => {});
  const mounted = useRef(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [defaults] = useState(() => garment?.facts);
  const locked = busy || photo.kind === 'processing';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => dialog?.close();
  }, []);
  useEffect(() => { if (photo.kind === 'ready') dialogRef.current?.querySelector<HTMLInputElement>('input[name=name]')?.focus(); }, [photo.kind]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelRecognition.current(); };
  }, []);

  function cancel(event?: SyntheticEvent) {
    event?.preventDefault();
    if (!locked) onCancel();
  }

  async function review(file: File | undefined) {
    cancelRecognition.current();
    setRecognition('');
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
        image = '';
        for (const quality of [0.85, 0.7, 0.55, 0.4]) {
          image = canvas.toDataURL('image/jpeg', quality).split(',')[1];
          if (image.length <= 1_333_332) break;
        }
        if (image.length > 1_333_332) throw new Error('too-large');
      } finally { bitmap.close(); }
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'too-large') {
        setError('This photo is too detailed to send. Choose a smaller or simpler photo.');
        setPhoto({ kind: 'empty' }); return;
      }
      setError('This file could not be opened as an image. Choose a different JPEG, PNG, or WebP photo.');
      setPhoto({ kind: 'empty' }); return;
    }
    if (!mounted.current) return;
    setPhoto({ kind: 'ready', image, interpretation: { kind: 'unavailable', reason: 'manual-review' } });
    setRecognition('Loading recognition model (about 154 MB on first use). You can confirm details now.');
    cancelRecognition.current = reviewOnDevice(image, (interpretation) => {
      setPhoto({ kind: 'ready', image, interpretation });
      setRecognition('');
    }, setRecognition);
  }

  async function save(form: HTMLFormElement) {
    const data = new FormData(form);
    const parsed = factsSchema.safeParse({ name: data.get('name'), category: data.get('category'), color: data.get('color'), size: data.get('size'),
      owned: data.get('owned') === 'on', available: data.get('available') === 'on', fit: data.get('fit'), weather: data.getAll('weather'), dressCode: data.getAll('dressCode') });
    if (!parsed.success) { setError('Confirm ownership and every detail, including at least one weather and one dress code.'); return; }
    if (!garment && (!consent || photo.kind !== 'ready')) { setError('Confirm permission and add a photo first.'); return; }
    const changes = Object.fromEntries(factsSchema.keyof().options.filter((key) => {
      const value = parsed.data[key];
      const previous = defaults?.[key];
      return Array.isArray(value) && Array.isArray(previous)
        ? value.length !== previous.length || value.some((entry) => !previous.some((item) => item === entry))
        : value !== previous;
    }).map((key) => [key, parsed.data[key]]));
    if (garment && Object.keys(changes).length === 0) { onCancel(); return; }
    setBusy(true); setError('');
    try {
      let saved: Garment | null = null;
      if (garment) saved = await wardrobeRequest(`/${garment.id}`, garmentSchema, changes, 'PATCH');
      else if (photo.kind === 'ready') {
        cancelRecognition.current();
        setRecognition('');
        saved = await wardrobeRequest('', garmentSchema, { facts: parsed.data, consent: true, image: photo.image, interpretation: photo.interpretation });
      }
      if (saved) await onSaved(saved);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The garment could not be saved. Try again.'); }
    finally { setBusy(false); }
  }

  const factsLocked = busy || (!garment && photo.kind !== 'ready');
  return <dialog ref={dialogRef} className="dialog garment-dialog" aria-labelledby="garment-form-title" onCancel={cancel}>
    <div className="dialog-header">
      <h2 id="garment-form-title" className="card-title">{garment ? `Edit ${garment.facts.name}` : 'Add a garment'}</h2>
      <button type="button" className="icon-button" aria-label="Close" onClick={cancel} disabled={locked}><X size={20} aria-hidden="true" /></button>
    </div>
    <form className="garment-form" onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget); }}>
      <div className="dialog-body">
        {!garment && <section className="editor-step" aria-labelledby="photo-step-title">
          <h3 id="photo-step-title" className="step-title"><span className="step-number" aria-hidden="true">1</span>Add a photo</h3>
          <label className="check"><input type="checkbox" checked={consent} disabled={locked} data-autofocus onChange={(event) => { cancelRecognition.current(); setRecognition(''); setConsent(event.target.checked); setPhoto({ kind: 'empty' }); }} /><span>I own this garment and have permission to use its photo. <span className="check-detail">I consent to GetYourFit checking and storing it in my private account on the GetYourFit server, without sharing or model training.</span></span></label>
          <div className={`dropzone${photo.kind === 'ready' ? ' dropzone-ready' : ''}`} data-disabled={!consent || locked || undefined}>
            {photo.kind === 'ready' ? <img src={`data:image/jpeg;base64,${photo.image}`} alt="Your resized garment photo" /> : <span className="dropzone-icon" aria-hidden="true">{photo.kind === 'processing' ? <span className="spinner" /> : <ImagePlus size={24} />}</span>}
            <span className="dropzone-copy"><span className="dropzone-title">{photo.kind === 'ready' ? 'Choose a different photo' : photo.kind === 'processing' ? 'Resizing your photo…' : 'Choose a photo'}</span><span className="caption">{consent ? 'JPEG, PNG, or WebP, up to 10 MB' : 'Confirm permission above to choose a photo'}</span></span>
            <input className="dropzone-input" type="file" aria-label="Garment photo" aria-describedby="photo-help" accept="image/jpeg,image/png,image/webp" disabled={!consent || locked} onChange={(event) => { void review(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
          <p id="photo-help" className="caption" role="status">{photo.kind === 'processing' ? 'Resizing your photo on this device…' : recognition || 'Your browser resizes the photo to 1200 px and removes camera and location details. Recognition runs on this device without WebGPU. Model files download from Hugging Face and may be cached; your photo is not sent there. Only saving uploads the resized photo to your private GetYourFit account.'}</p>
          {recognition && <button type="button" className="button button-secondary" onClick={() => { cancelRecognition.current(); setRecognition(''); }}>Skip recognition and confirm manually</button>}
          {photo.kind === 'ready' && <InterpretationNote interpretation={photo.interpretation} />}
        </section>}
        <fieldset className="editor-step field-group" disabled={factsLocked}>
          <legend className="step-title">{!garment && <span className="step-number" aria-hidden="true">2</span>}Confirm your garment facts</legend>
          {!garment && <p className="caption step-note">Your answers are the facts used for outfits. A photo can’t establish fit, ownership, weather, or dress code.</p>}
          <div className="field-grid">
            <Field label="Name">{(control) => <input {...control} className="input" data-autofocus={garment ? true : undefined} name="name" maxLength={80} required defaultValue={defaults?.name ?? ''} />}</Field>
            <Field label="Category">{(control) => <select {...control} className="select" name="category" required defaultValue={defaults?.category ?? ''}><option value="" disabled>Choose a category</option>{categorySchema.options.map((value) => <option key={value} value={value}>{categoryLabel[value]}</option>)}</select>}</Field>
            <Field label="Color">{(control) => <input {...control} className="input" name="color" maxLength={40} required defaultValue={defaults?.color ?? ''} />}</Field>
            <Field label="Size on label" hint="Write “unknown” if there’s no label.">{(control) => <input {...control} className="input" name="size" maxLength={40} required defaultValue={defaults?.size ?? ''} />}</Field>
            <Field label="Does it fit you now?">{(control) => <select {...control} className="select" name="fit" defaultValue={defaults?.fit ?? 'unknown'}><option value="unknown">I’m not sure</option><option value="fits">Yes, it fits</option><option value="does-not-fit">No, it does not fit</option></select>}</Field>
          </div>
          <FactOptions name="weather" title="Weather you’d wear it in" values={weatherSchema.options} labels={weatherLabel} selected={defaults?.weather ?? []} />
          <FactOptions name="dressCode" title="Dress codes you’d wear it for" values={dressCodeSchema.options} labels={dressCodeLabel} selected={defaults?.dressCode ?? []} />
          <div>
            <label className="check"><input type="checkbox" name="available" defaultChecked={defaults?.available ?? true} /><span>Available to wear now</span></label>
            <label className="check"><input type="checkbox" name="owned" defaultChecked={defaults?.owned ?? false} required /><span>I confirm this garment is mine and these are my facts.</span></label>
          </div>
        </fieldset>
        {garment && <details className="disclosure"><summary>How these facts were recorded</summary><p>You confirmed every fact yourself, and edits are saved as your corrections. No model sets outfit facts.</p><InterpretationNote interpretation={garment.interpretation} /></details>}
        {error && <Notice ref={errorRef} tone="error" role="alert" focusable>{error}</Notice>}
      </div>
      <div className="dialog-footer">
        <button type="button" className="button button-secondary" onClick={cancel} disabled={locked}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={factsLocked}>{busy ? 'Saving…' : garment ? 'Save changes' : 'Save garment'}</button>
      </div>
    </form>
  </dialog>;
}

function FactOptions<Value extends string>({ name, title, values, labels, selected }: { name: keyof Pick<Facts, 'weather' | 'dressCode'>; title: string; values: readonly Value[]; labels: Record<Value, string>; selected: readonly string[] }) {
  return <fieldset className="field-group"><legend className="field-label">{title}</legend><div className="chips">{values.map((value) => <label className="chip" key={value}><input type="checkbox" name={name} value={value} defaultChecked={selected.includes(value)} />{labels[value]}</label>)}</div></fieldset>;
}

function confidenceWord(confidence: number): string {
  return confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
}

export function InterpretationNote({ interpretation }: { interpretation: z.infer<typeof interpretationSchema> }) {
  if (interpretation.kind === 'unavailable') return <p className="caption">{interpretation.reason === 'no-clothing-label' ? 'The photo check didn’t recognize a garment type.' : interpretation.reason === 'manual-review' ? 'You can confirm details without a model label.' : interpretation.reason === 'model-timeout' ? 'Recognition took too long on this connection or device.' : 'Image classification is unavailable on this device or connection.'} Enter the details yourself; no score has been invented.</p>;
  return <div className="photo-check">
    <p>Photo check suggests <strong>{interpretation.label}</strong>, with {confidenceWord(interpretation.confidence)} confidence ({Math.round(interpretation.confidence * 100)}%). Choose the category yourself below.</p>
    <p className="caption">{interpretation.source} · {interpretation.modelVersion}. The score is uncertain and doesn’t measure fit or style.</p>
  </div>;
}
