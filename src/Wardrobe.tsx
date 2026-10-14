import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Plus, ArrowUpRight } from 'lucide-react';
import { contextSchema, decisionSchema, dressCodeSchema, garmentSchema, wardrobeSchema, weatherSchema, type Context, type Decision, type Garment } from '../shared/wardrobe';
import { GarmentForm, InterpretationNote } from './GarmentForm';
import { wardrobeRequest } from './wardrobe-api';

type Editor = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; garment: Garment };
const savedSchema = z.object({ saved: z.literal(true) });

export function Wardrobe() {
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  const [context, setContext] = useState<Context>({ occasion: '', weather: 'unknown', dressCode: 'unknown' });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [remove, setRemove] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    let mounted = true;
    void wardrobeRequest('', wardrobeSchema, undefined, 'GET').then((items) => { if (mounted) setGarments(items); }).catch((cause: unknown) => {
      if (mounted) setError(cause instanceof Error ? cause.message : 'Your wardrobe could not be loaded.');
    });
    return () => { mounted = false; };
  }, []);

  async function refresh() { setGarments(await wardrobeRequest('', wardrobeSchema, undefined, 'GET')); }
  async function act(callback: () => Promise<void>) {
    setBusy(true); setError('');
    try { await callback(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This action could not be completed.'); }
    finally { setBusy(false); }
  }
  async function decide() { setDecision(await wardrobeRequest('/outfit', decisionSchema, context)); }
  function changeContext(next: Context) { setContext(next); setDecision(null); }

  return <div className="wardrobe-content">
    <section aria-labelledby="wardrobe-title">
      <div className="section-heading wardrobe-heading"><div><p className="eyebrow">YOUR OWN CLOTHES, FIRST</p><h1 id="wardrobe-title" ref={titleRef} tabIndex={-1}>A wardrobe worth knowing.</h1><p className="lede">Keep the clothes you own close. Make one clear decision about what to wear.</p></div>{editor.kind === 'closed' && <button className="button button-primary" disabled={busy || garments === null || garments.length >= 50} onClick={() => setEditor({ kind: 'add' })}><Plus size={16} /> Add garment</button>}</div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {editor.kind !== 'closed' && <GarmentForm key={editor.kind === 'edit' ? editor.garment.id : 'add'} garment={editor.kind === 'edit' ? editor.garment : null} onCancel={() => setEditor({ kind: 'closed' })} onSaved={async () => { await refresh(); setDecision(null); setEditor({ kind: 'closed' }); }} />}
      {garments === null ? <p role="status">{error ? 'Your wardrobe is unavailable. Check your connection and reload to try again.' : 'Opening your wardrobe…'}</p> : garments.length === 0 ? <div className="wardrobe-empty"><span className="empty-number">01</span><div><h2>Start with something you own.</h2><p>One real photo, then the facts only you can confirm. For a complete outfit, add a top and bottom (or one-piece) and footwear.</p></div></div> : <>
        <p className="wardrobe-count">{garments.length} {garments.length === 1 ? 'garment' : 'garments'} · Private in your account</p>
        <div className="garment-grid">{garments.map((item) => <article className="garment-card" key={item.id}>
          <img src={item.photoUrl} alt={item.facts.name} loading="lazy" width={400} height={400} />
          <div className="garment-card-copy"><p className="eyebrow">{item.facts.category}</p><h2>{item.facts.name}</h2><p>{item.facts.color} · Size {item.facts.size} · {item.facts.fit === 'fits' ? 'Fits you' : item.facts.fit === 'unknown' ? 'Fit unconfirmed' : 'Does not fit'}</p><p>{item.facts.available ? 'Available' : 'Unavailable'} · {item.facts.weather.join(', ')} · {item.facts.dressCode.join(', ')}</p>
          <details><summary>Fact sources</summary><InterpretationNote interpretation={item.interpretation} /><p>Every outfit fact is confirmed by you. Changed facts are recorded as wearer corrections; model version null, confidence 1.</p></details>
          <div className="garment-actions"><button className="text-button" disabled={busy || editor.kind !== 'closed'} onClick={() => { setDecision(null); setEditor({ kind: 'edit', garment: item }); }}>Edit details</button>{remove !== item.id ? <button className="text-button" disabled={busy || editor.kind !== 'closed'} onClick={() => setRemove(item.id)}>Remove</button> : <><button className="text-button remove-confirm" disabled={busy || editor.kind !== 'closed'} onClick={() => void act(async () => { await wardrobeRequest(`/${item.id}`, z.object({ deleted: z.literal(true) }), undefined, 'DELETE'); await refresh(); setDecision(null); setRemove(''); })}>Confirm remove</button><button className="text-button" disabled={busy || editor.kind !== 'closed'} onClick={() => setRemove('')}>Keep</button></>}</div></div>
        </article>)}</div>
      </>}
    </section>
    <section className="outfit-section" id="outfit" aria-labelledby="outfit-title">
      <div className="section-heading"><div><p className="eyebrow">ONE DECISION</p><h2 id="outfit-title">What are you dressing for?</h2><p className="lede">You set the context. We check your confirmed facts, then show a complete set you already own.</p></div><ArrowUpRight size={24} aria-hidden="true" /></div>
      <form className="context-form" onSubmit={(event) => { event.preventDefault(); void act(decide); }}>
        <label>Occasion<input className="text-input" disabled={busy} value={context.occasion} maxLength={120} placeholder="Where are you going?" onChange={(event) => changeContext({ ...context, occasion: event.target.value })} /></label>
        <label>Weather<select className="text-input" disabled={busy} value={context.weather} onChange={(event) => changeContext(contextSchema.parse({ ...context, weather: event.target.value }))}><option value="unknown">I’m not sure</option>{weatherSchema.options.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Dress code<select className="text-input" disabled={busy} value={context.dressCode} onChange={(event) => changeContext(contextSchema.parse({ ...context, dressCode: event.target.value }))}><option value="unknown">I’m not sure</option>{dressCodeSchema.options.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button className="button button-primary" disabled={busy || editor.kind !== 'closed' || garments === null}>{busy ? 'Checking…' : 'Find an outfit'}</button>
      </form>
      <div aria-live="polite" aria-atomic="true">
      {decision?.kind === 'context-question' && <div className="decision-note"><p className="eyebrow">ONE QUESTION FIRST</p><h3>{decision.question}</h3><p>Update the {decision.field === 'dressCode' ? 'dress code' : decision.field} above, then choose Find an outfit.</p></div>}
      {decision?.kind === 'fit-question' && <div className="decision-note"><p className="eyebrow">ONE QUESTION FIRST</p><h3>{decision.question}</h3><p>Your answer becomes the garment’s fit fact and takes precedence.</p><div className="button-stack">{(['fits', 'does-not-fit'] satisfies Garment['facts']['fit'][]).map((fit) => <button className="button button-secondary" key={fit} disabled={busy} onClick={() => void act(async () => { const item = garments?.find((garment) => garment.id === decision.garmentId); if (!item) throw new Error('Reopen your wardrobe and try again.'); await wardrobeRequest(`/${item.id}`, garmentSchema, { ...item.facts, fit }, 'PATCH'); await refresh(); await decide(); })}>{fit === 'fits' ? 'Yes, it fits' : 'No, it does not fit'}</button>)}</div></div>}
      {decision?.kind === 'incomplete' && <div className="decision-note"><p className="eyebrow">NO COMPLETE OUTFIT YET</p><h3>A few facts still need to line up.</h3><p>{decision.explanation}</p></div>}
      {decision?.kind === 'complete' && <div className="outfit-result"><p className="eyebrow">YOU ALREADY OWN IT</p><h3>A complete set for {context.occasion}.</h3><p className="decision-explanation">{decision.explanation}</p><div className="garment-grid">{decision.items.map((item) => <article className="outfit-item" key={item.id}><img src={item.photoUrl} alt={item.facts.name} width={400} height={400} /><h4>{item.facts.name}</h4><p>{item.facts.category} · {item.facts.color}</p><button className="button button-secondary" disabled={busy} onClick={() => void act(async () => { await wardrobeRequest('/correction', savedSchema, { context, garmentId: item.id, excluded: true }); await decide(); })}>Don’t use this for this occasion</button></article>)}</div></div>}
      </div>
      {decision && 'excludedCount' in decision && decision.excludedCount > 0 && <div className="correction-note"><p>{decision.excludedCount} {decision.excludedCount === 1 ? 'item stays' : 'items stay'} excluded for this occasion, weather, and dress code. Your correction wins.</p><button className="text-button" disabled={busy} onClick={() => void act(async () => { for (const item of garments ?? []) await wardrobeRequest('/correction', savedSchema, { context, garmentId: item.id, excluded: false }); await decide(); })}>Allow excluded items again</button></div>}
    </section>
  </div>;
}
