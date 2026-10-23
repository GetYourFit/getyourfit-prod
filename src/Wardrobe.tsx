import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { z } from 'zod';
import { ArrowRight, Pencil, Plus, Shirt, Trash2 } from 'lucide-react';
import { wardrobeSchema, type Garment } from '../shared/wardrobe';
import { GarmentForm } from './GarmentForm';
import { wardrobeRequest } from './wardrobe-api';
import { StarterPlan } from './StarterPlan';
import { Outfit } from './Outfit';
import { categoryLabel, dressCodeLabel, fitLabel, weatherLabel } from './labels';
import { Field, Notice } from './ui';

type Editor = { kind: 'closed' } | { kind: 'add' } | { kind: 'edit'; garmentId: string };

export function Wardrobe({ account }: { account: string }) {
  const [garments, setGarments] = useState<Garment[] | null>(null);
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [remove, setRemove] = useState('');
  const [revision, setRevision] = useState(0);
  const [planFirst, setPlanFirst] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Garment['facts']['category'] | 'all'>('all');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const refreshRequest = useRef(0);

  useEffect(() => {
    titleRef.current?.focus();
    let mounted = true;
    const request = ++refreshRequest.current;
    void wardrobeRequest('', wardrobeSchema, undefined, 'GET').then((items) => { if (mounted && request === refreshRequest.current) setGarments(items); }).catch((cause: unknown) => {
      if (mounted && request === refreshRequest.current) setError(cause instanceof Error ? cause.message : 'Your wardrobe could not be loaded.');
    });
    return () => { mounted = false; refreshRequest.current += 1; };
  }, []);

  async function refresh() {
    const request = ++refreshRequest.current;
    try {
      const items = await wardrobeRequest('', wardrobeSchema, undefined, 'GET');
      if (request !== refreshRequest.current) return;
      flushSync(() => { setGarments(items); setRevision((value) => value + 1); });
    } catch (cause) { if (request === refreshRequest.current) throw cause; }
  }
  async function act(callback: () => Promise<void>) {
    setBusy(true); setError('');
    try { await callback(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This action could not be completed.'); }
    finally { setBusy(false); }
  }
  function open(next: Editor, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setStatus('');
    setEditor(next);
  }
  function close() {
    setEditor({ kind: 'closed' });
    const target = returnFocus.current;
    globalThis.requestAnimationFrame(() => (target?.isConnected ? target : document.querySelector<HTMLElement>('#add-garment'))?.focus());
  }
  async function retryLoad() {
    await act(async () => { await refresh(); });
  }

  const full = garments !== null && garments.length >= 50;
  const visibleGarments = garments?.filter((item) => (category === 'all' || item.facts.category === category) && `${item.facts.name} ${item.facts.color}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const editedGarment = editor.kind === 'edit' ? garments?.find((item) => item.id === editor.garmentId) : undefined;
  if (editor.kind === 'edit' && garments !== null && !editedGarment) setEditor({ kind: 'closed' });
  return <div className="page">
    <header className="page-header">
      <div className="page-heading">
        <h1 id="wardrobe-title" className="page-title" ref={titleRef} tabIndex={-1}>Your wardrobe</h1>
        {!planFirst && <p className="lead">A little more possibility in what you already own. Add your clothes, confirm the details, then dress for your day.</p>}
      </div>
      {!planFirst && <div className="button-row page-actions">
        <a className="button button-secondary" href="#build-plan">Build my wardrobe</a>
        <button id="add-garment" className="button button-primary" disabled={busy || garments === null || full || editor.kind !== 'closed'} onClick={(event) => open({ kind: 'add' }, event.currentTarget)}><Plus size={18} aria-hidden="true" />Add garment</button>
      </div>}
    </header>

    {error && <Notice tone="error" role="alert">{error}{garments === null && <span><button type="button" className="text-link" onClick={() => void retryLoad()} disabled={busy}>Try loading your wardrobe again</button></span>}</Notice>}
    <p className="visually-hidden" role="status">{status}</p>

    {planFirst && <StarterPlan key="starter-plan" account={account} onPresenceChange={setPlanFirst} />}

    <section className="page-section clothes-section" aria-labelledby="clothes-title">
      <div className="section-head">
        <h2 id="clothes-title" className="section-title">Clothes</h2>
        {planFirst && <button id="add-garment" className="button button-primary" disabled={busy || garments === null || full || editor.kind !== 'closed'} onClick={(event) => open({ kind: 'add' }, event.currentTarget)}><Plus size={18} aria-hidden="true" />Add garment</button>}
        {garments !== null && <p className="caption">{garments.length === 0 ? 'None added yet' : `${garments.length} ${garments.length === 1 ? 'garment' : 'garments'} · Private to your account`}{full ? ' · Wardrobe full' : ''}</p>}
      </div>
      {garments !== null && <div className="wardrobe-coverage">
        <p>{garments.length === 0 ? 'A complete outfit starts with a few pieces.' : 'Build an outfit from your confirmed details.'}</p>
        <ul aria-label="Garments added by role">{(garments.some((item) => item.facts.category === 'one-piece') ? ['one-piece', 'footwear'] as const : ['top', 'bottom', 'footwear'] as const).map((role) => <li key={role}><span>{categoryLabel[role]}</span><strong>{garments.filter((item) => item.facts.category === role).length} added</strong></li>)}</ul>
        {garments.length > 0 && <a className="text-link" href="#outfit">Check an outfit<ArrowRight size={18} aria-hidden="true" /></a>}
      </div>}
      {garments !== null && garments.length > 0 && <div className="wardrobe-tools">
        <Field label="Find your clothes">{(control) => <input {...control} type="search" className="input" placeholder="Search by name or colour" value={search} onChange={(event) => setSearch(event.target.value)} />}</Field>
        <Field label="Show">{(control) => <select {...control} className="select" value={category} onChange={(event) => { const next = event.target.value; if (next === 'all' || next === 'top' || next === 'bottom' || next === 'footwear' || next === 'one-piece') setCategory(next); }}><option value="all">All clothes</option><option value="top">Tops</option><option value="bottom">Bottoms</option><option value="one-piece">One-pieces</option><option value="footwear">Footwear</option></select>}</Field>
        <p className="caption" role="status">{visibleGarments?.length} of {garments.length} shown</p>
      </div>}
      {garments === null ? !error && <div className="garment-grid" aria-busy="true"><p role="status" className="caption">Opening your wardrobe…</p></div>
        : garments.length === 0 ? <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true"><Shirt size={24} /></span>
          <h3 className="card-title">Add your first garment</h3>
          <p>Start with one real photo, then confirm the facts only you know. For a complete outfit, add a top and a bottom (or a one-piece) and footwear.</p>
          <div className="button-row"><button className="button button-primary" disabled={busy || editor.kind !== 'closed'} onClick={(event) => open({ kind: 'add' }, event.currentTarget)}><Plus size={18} aria-hidden="true" />Add a garment</button><a className="text-link" href="#build-plan">Or plan what you need first</a></div>
        </div>
        : visibleGarments?.length === 0 ? <div className="empty-state"><h3 className="card-title">No clothes match that search</h3><p>Try a different name or colour, or show all your clothes.</p><button className="button button-secondary" onClick={() => { setSearch(''); setCategory('all'); }}>Show all clothes</button></div>
        : <ul className="garment-grid">{visibleGarments?.map((item) => <li key={item.id}><article className="garment-card" aria-labelledby={`garment-${item.id}`}>
          <div className="garment-photo"><img src={item.photoUrl} alt={item.facts.name} loading="lazy" width={400} height={400} /></div>
          <div className="garment-body">
            <h3 id={`garment-${item.id}`} className="card-title">{item.facts.name}</h3>
            <p className="caption">{categoryLabel[item.facts.category]} · {item.facts.color} · Size {item.facts.size}</p>
            <div className="badge-row">
              <span className={`badge ${item.facts.fit === 'fits' ? 'badge-positive' : item.facts.fit === 'unknown' ? 'badge-warning' : 'badge-danger'}`}>{fitLabel[item.facts.fit]}</span>
              {!item.facts.available && <span className="badge">Unavailable</span>}
            </div>
            <p className="caption">{item.facts.weather.map((value) => weatherLabel[value]).join(', ')} weather · {item.facts.dressCode.map((value) => dressCodeLabel[value]).join(', ')}</p>
          </div>
          <div className="garment-actions">{remove !== item.id
            ? <><button className="button button-ghost" disabled={busy || editor.kind !== 'closed'} aria-label={`Edit ${item.facts.name}`} onClick={(event) => open({ kind: 'edit', garmentId: item.id }, event.currentTarget)}><Pencil size={16} aria-hidden="true" />Edit</button><button className="button button-danger-ghost" disabled={busy || editor.kind !== 'closed'} aria-label={`Remove ${item.facts.name}`} onClick={() => setRemove(item.id)}><Trash2 size={16} aria-hidden="true" />Remove</button></>
            : <><span className="garment-confirm">Remove from your wardrobe?</span><button className="button button-danger-ghost remove-confirm" autoFocus disabled={busy} onClick={() => void act(async () => { await wardrobeRequest(`/${item.id}`, z.object({ deleted: z.literal(true) }), undefined, 'DELETE'); setRemove(''); await refresh(); setStatus(`${item.facts.name} was removed from your wardrobe.`); document.querySelector<HTMLElement>('#add-garment')?.focus(); })}>Yes, remove</button><button className="button button-ghost" disabled={busy} onClick={() => setRemove('')}>Keep</button></>}
          </div>
        </article></li>)}</ul>}
    </section>

    <Outfit garments={garments} disabled={editor.kind !== 'closed'} revision={revision} onGarmentsChanged={refresh} />
    {!planFirst && <StarterPlan key="starter-plan" account={account} onPresenceChange={setPlanFirst} />}

    {(editor.kind === 'add' || editedGarment) && <GarmentForm key={editedGarment?.id ?? 'add'} garment={editedGarment ?? null} onCancel={close} onSaved={async (saved) => {
      await refresh();
      setStatus(editor.kind === 'edit' ? `Changes to ${saved.facts.name} were saved.` : `${saved.facts.name} was added to your wardrobe.`);
      close();
    }} />}
  </div>;
}
