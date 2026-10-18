import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { contextSchema, decisionSchema, dressCodeSchema, garmentSchema, weatherSchema, type Context, type Decision, type Garment } from '../shared/wardrobe';
import { wardrobeRequest } from './wardrobe-api';
import { categoryLabel, dressCodeLabel, weatherLabel } from './labels';
import { Field, Notice } from './ui';

const savedSchema = z.object({ saved: z.literal(true) });

export function Outfit({ garments, disabled, revision, onGarmentsChanged }: { garments: Garment[] | null; disabled: boolean; revision: number; onGarmentsChanged: () => Promise<void> }) {
  const [context, setContext] = useState<Context>({ occasion: '', weather: 'unknown', dressCode: 'unknown' });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);

  const [seenRevision, setSeenRevision] = useState(revision);
  if (revision !== seenRevision) { setSeenRevision(revision); setDecision(null); }
  useEffect(() => {
    if (!decision || !focusResult.current) return;
    focusResult.current = false;
    resultRef.current?.querySelector<HTMLElement>('[data-result-focus]')?.focus();
  }, [decision]);

  async function act(callback: () => Promise<void>) {
    setBusy(true); setError('');
    try { await callback(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This action could not be completed. Try again.'); }
    finally { setBusy(false); }
  }
  async function decide() {
    const next = await wardrobeRequest('/outfit', decisionSchema, context);
    focusResult.current = true;
    setDecision(next);
  }
  function changeContext(next: Context) { setContext(next); setDecision(null); }

  const locked = busy || disabled || garments === null;
  return <section className="page-section card outfit-card" id="outfit" aria-labelledby="outfit-title">
    <div className="card-header">
      <div><h2 id="outfit-title" className="section-title">What are you dressing for?</h2><p className="muted">Set the occasion, weather and dress code. We check the facts you confirmed and choose one complete outfit you already own.</p></div>
    </div>
    <form className="outfit-form" onSubmit={(event) => { event.preventDefault(); void act(decide); }}>
      <Field label="Occasion">{(control) => <input {...control} className="input" disabled={busy} value={context.occasion} maxLength={120} placeholder="For example, dinner with friends" onChange={(event) => changeContext({ ...context, occasion: event.target.value })} />}</Field>
      <Field label="Weather">{(control) => <select {...control} className="select" disabled={busy} value={context.weather} onChange={(event) => changeContext(contextSchema.parse({ ...context, weather: event.target.value }))}><option value="unknown">I’m not sure</option>{weatherSchema.options.map((value) => <option key={value} value={value}>{weatherLabel[value]}</option>)}</select>}</Field>
      <Field label="Dress code">{(control) => <select {...control} className="select" disabled={busy} value={context.dressCode} onChange={(event) => changeContext(contextSchema.parse({ ...context, dressCode: event.target.value }))}><option value="unknown">I’m not sure</option>{dressCodeSchema.options.map((value) => <option key={value} value={value}>{dressCodeLabel[value]}</option>)}</select>}</Field>
      <button className="button button-primary outfit-submit" disabled={locked}>{busy ? <><span className="spinner" aria-hidden="true" />Checking</> : 'Find an outfit'}</button>
    </form>
    {error && <Notice tone="error" role="alert">{error}</Notice>}
    <div className="outfit-outcome" ref={resultRef} aria-live="polite" aria-atomic="true">
      {decision?.kind === 'context-question' && <Notice tone="info" title={<span data-result-focus tabIndex={-1}>{decision.question}</span>}><p>Add the {decision.field === 'dressCode' ? 'dress code' : decision.field} above, then choose Find an outfit.</p></Notice>}
      {decision?.kind === 'fit-question' && <Notice tone="info" title={<span data-result-focus tabIndex={-1}>{decision.question}</span>}>
        <p>Your answer becomes this garment’s fit fact.</p>
        <div className="button-row">{(['fits', 'does-not-fit'] satisfies Garment['facts']['fit'][]).map((fit) => <button className="button button-secondary" key={fit} disabled={busy} onClick={() => void act(async () => { const item = garments?.find((garment) => garment.id === decision.garmentId); if (!item) throw new Error('Reload your wardrobe and try again.'); await wardrobeRequest(`/${item.id}`, garmentSchema, { ...item.facts, fit }, 'PATCH'); await onGarmentsChanged(); await decide(); })}>{fit === 'fits' ? 'Yes, it fits' : 'No, it doesn’t fit'}</button>)}</div>
      </Notice>}
      {decision?.kind === 'incomplete' && <Notice tone="warning" title={<span data-result-focus tabIndex={-1}>No complete outfit yet</span>}><p>{decision.explanation}</p></Notice>}
      {decision?.kind === 'complete' && <div className="outfit-result">
        <div className="outfit-result-head">
          <span className="badge badge-positive"><Check size={14} aria-hidden="true" />You already own it</span>
          <h3 className="section-title" data-result-focus tabIndex={-1}>Your outfit for {context.occasion}</h3>
          <p className="prose">{decision.explanation}</p>
        </div>
        <ul className="outfit-items">{decision.items.map((item) => <li key={item.id} className="outfit-item">
          <div className="garment-photo"><img src={item.photoUrl} alt={item.facts.name} width={400} height={400} /></div>
          <div className="outfit-item-copy"><h4 className="card-title">{item.facts.name}</h4><p className="caption">{categoryLabel[item.facts.category]} · {item.facts.color}</p></div>
          <button className="button button-ghost" disabled={busy} aria-label={`Don’t use ${item.facts.name} for this occasion`} onClick={() => void act(async () => { await wardrobeRequest('/correction', savedSchema, { context, garmentId: item.id, excluded: true }); await decide(); })}>Don’t use for this occasion</button>
        </li>)}</ul>
      </div>}
    </div>
    {decision && 'excludedCount' in decision && decision.excludedCount > 0 && <div className="correction-note"><p className="caption">{decision.excludedCount} {decision.excludedCount === 1 ? 'item stays' : 'items stay'} excluded for this occasion, weather and dress code. Your correction wins.</p><button className="text-link" disabled={busy} onClick={() => void act(async () => { for (const item of garments ?? []) await wardrobeRequest('/correction', savedSchema, { context, garmentId: item.id, excluded: false }); await decide(); })}>Allow excluded items again</button></div>}
  </section>;
}
