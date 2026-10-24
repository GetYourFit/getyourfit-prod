import './zod-config';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { starterInputSchema, buildStarterRoles, type StarterInput } from '../shared/starter-plan';
import { composeBoard } from '../shared/outfit-board';
import { countStep } from './funnel';
import { holdPendingPlan } from './pending-plan';
import { OutfitBoard, OutfitBoardPanel } from './OutfitBoard';
import { Brand, Field, Notice } from './ui';
import { requireSession } from './session';
import './LandingPage.css';

type Values = { occasion: string; outfitType: StarterInput['outfitType']; budget: string; currency: StarterInput['currency']; weather: StarterInput['weather']; dressCode: StarterInput['dressCode'] };
const occasions = ['Office day', 'Dinner with friends', 'Family function', 'College day', 'Travel'];
const weatherOptions: { value: StarterInput['weather']; label: string }[] = [{ value: 'warm', label: 'Warm' }, { value: 'mild', label: 'Mild' }, { value: 'cold', label: 'Cold' }, { value: 'unknown', label: 'Not sure' }];
const dressCodes: { value: StarterInput['dressCode']; label: string }[] = [{ value: 'unknown', label: 'Not sure' }, { value: 'casual', label: 'Casual' }, { value: 'smart-casual', label: 'Smart casual' }, { value: 'formal', label: 'Formal' }];
const label = <T extends string>(options: { value: T; label: string }[], value: T) => options.find((option) => option.value === value)?.label ?? value;

const sampleInput = starterInputSchema.parse({ occasion: 'Dinner with friends', outfitType: 'separates', budget: 5000, currency: 'INR', weather: 'mild', dressCode: 'casual', mustHave: '', ownedRoles: [] });
const sampleBoard = composeBoard(sampleInput, buildStarterRoles(sampleInput, '2026-01-01T00:00:00.000Z'));

export default function PlanPage({ account }: { account: string }) {
  const [values, setValues] = useState<Values>({ occasion: '', outfitType: 'separates', budget: '5000', currency: 'INR', weather: 'mild', dressCode: 'unknown' });
  const [input, setInput] = useState<StarterInput | null>(null);
  const [selectedLook, setSelectedLook] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    countStep('plan_opened');
    document.title = 'Plan an outfit - GetYourFit';
    window.scrollTo(0, 0);
    pageHeading.current?.focus({ preventScroll: true });
  }, []);

  const board = useMemo(() => input ? composeBoard(input, buildStarterRoles(input, new Date().toISOString())) : null, [input]);
  const look = board?.looks[0];
  const sample = sampleBoard.looks[selectedLook] ?? sampleBoard.looks[0]!;

  useEffect(() => {
    if (!board) return;
    countStep('outfit_shown');
    countStep('save_prompt_shown');
    resultHeading.current?.focus();
    resultHeading.current?.scrollIntoView({ block: 'start' });
  }, [board]);

  function set<Key extends keyof Values>(key: Key, value: Values[Key]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = starterInputSchema.safeParse({ ...values, budget: Number(values.budget), mustHave: '', ownedRoles: [] });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setError(field === 'occasion' ? 'Add the occasion to continue.' : field === 'budget' ? 'Enter a whole-number budget from 0 to 1,000,000.' : 'Check your answers and try again.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await requireSession(account);
      countStep('plan_submitted', { once: false });
      if (input || parsed.data.outfitType === 'one-piece') setSelectedLook(0);
      setInput(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your plan could not be opened. Try again.');
    } finally { setBusy(false); }
  }

  async function saveAfterValue() {
    if (!input) return;
    setBusy(true);
    try {
      holdPendingPlan({ ...input, selectedLook }, account);
      await requireSession(account);
      countStep('save_prompt_accepted');
      window.history.pushState({}, '', '/wardrobe#build-plan');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo(0, 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your plan could not be saved. Try again.');
    } finally { setBusy(false); }
  }

  return <div className="public-page plan-page">
    <a className="skip-link" href="#plan-main">Skip to content</a>
    <header className="public-header">
      <Brand href="/" />
      <a className="public-link" href="/wardrobe">My wardrobe<ArrowRight size={16} aria-hidden="true" /></a>
    </header>
    <main id="plan-main">
      <div className="plan-intro">
        <h1 ref={pageHeading} tabIndex={-1}>A wardrobe starts<br />with a plan.</h1>
        <p>Start with your occasion. Explore an illustrative outfit plan, then save the look you want to keep in your private account.</p>
      </div>
      <div className={`plan-layout${input ? ' has-result' : ''}`}>
        <form className="plan-form card" onSubmit={(event) => void submit(event)} noValidate aria-labelledby="plan-form-title" aria-busy={busy}>
          <h2 id="plan-form-title" className="card-title" tabIndex={-1} ref={formHeading}>Your plan</h2>
          <Field label="What is the occasion?" hint="Type your own or pick one.">
            {(control) => <input {...control} className="input" name="occasion" maxLength={120} required autoComplete="off" value={values.occasion} onChange={(event) => set('occasion', event.target.value)} aria-invalid={error.startsWith('Add the occasion') || undefined} />}
          </Field>
          <div className="chips" role="group" aria-label="Occasion suggestions">
            {occasions.map((name) => <button key={name} type="button" className="chip" aria-pressed={values.occasion === name} onClick={() => set('occasion', name)}>{name}</button>)}
          </div>
          <fieldset className="field-group">
            <legend className="field-label">What is the weather like?</legend>
            <div className="chips">
              {weatherOptions.map((option) => <label className="chip" key={option.value}><input type="radio" name="weather" checked={values.weather === option.value} onChange={() => set('weather', option.value)} />{option.label}</label>)}
            </div>
          </fieldset>
          <fieldset className="field-group">
            <legend className="field-label">What do you need?</legend>
            <div className="chips">
              <label className="chip"><input type="radio" name="outfitType" checked={values.outfitType === 'separates'} onChange={() => set('outfitType', 'separates')} />Top, bottom and shoes</label>
              <label className="chip"><input type="radio" name="outfitType" checked={values.outfitType === 'one-piece'} onChange={() => set('outfitType', 'one-piece')} />One-piece and shoes</label>
            </div>
          </fieldset>
          <div className="field-grid">
            <Field label="Spending ceiling">{(control) => <input {...control} className="input" name="budget" type="number" min="0" max="1000000" step="1" inputMode="numeric" required value={values.budget} onChange={(event) => set('budget', event.target.value)} aria-invalid={error.startsWith('Enter a whole') || undefined} />}</Field>
            <Field label="Currency">{(control) => <select {...control} className="select" name="currency" value={values.currency} onChange={(event) => set('currency', starterInputSchema.shape.currency.parse(event.target.value))}><option value="INR">INR · Indian rupee</option><option value="USD">USD · US dollar</option><option value="GBP">GBP · British pound</option></select>}</Field>
          </div>
          <Field label="Dress code" optional>{(control) => <select {...control} className="select" name="dressCode" value={values.dressCode} onChange={(event) => set('dressCode', starterInputSchema.shape.dressCode.parse(event.target.value))}>{dressCodes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</Field>
          {error && <Notice tone="error" role="alert">{error}</Notice>}
          <button className="button button-primary button-split" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Show my outfit'}<ArrowRight size={18} aria-hidden="true" /></button>
          <p className="caption plan-privacy"><LockKeyhole size={16} aria-hidden="true" />Your answers stay in this browser until you choose to save.</p>
        </form>
        <section className="plan-result" aria-labelledby="plan-result-title" aria-live="polite">
          {input && board && look ? <>
            <div className="plan-result-heading">
              <h2 id="plan-result-title" tabIndex={-1} ref={resultHeading}>Your outfit for {input.occasion}</h2>
              <p>{input.weather === 'unknown' ? 'Weather not given' : `${label(weatherOptions, input.weather)} weather`} · {input.dressCode === 'unknown' ? 'Dress code not given' : label(dressCodes, input.dressCode)} · {input.outfitType === 'separates' ? 'Top, bottom and shoes' : 'One-piece and shoes'}</p>
            </div>
            <OutfitBoardPanel account={account} input={input} board={board} selection={{ index: selectedLook, disabled: busy, onChange: setSelectedLook, onPending: setBusy }} />
            <div className="plan-reasons">
              <h3>Why this works</h3>
              <ul>{board.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <p className="caption">{look.why} These are general suggestions built from your answers, not a verified fit or a taste prediction. Garment photographs are stand-ins for the kind of piece to look for.</p>
            </div>
            <div className="plan-save card" role="region" aria-labelledby="plan-save-title">
              <h3 id="plan-save-title">Keep this outfit</h3>
              <p>Save this plan, including your chosen look, in your private account on the GetYourFit server. Garment photos are examples; no clothes are added to your wardrobe.</p>
              <button className="button button-primary button-split" type="button" disabled={busy} onClick={() => void saveAfterValue()}>Save this plan<ArrowRight size={18} aria-hidden="true" /></button>
            </div>
          </> : <div className="plan-placeholder">
            <h2 id="plan-result-title" className="card-title">The pieces, together.</h2>
            <OutfitBoard look={sample} heading="Example outfit" />
            <p className="caption">Example garment photos. Your answers shape a general needs plan, not a fit prediction or a verified shopping offer.</p>
          </div>}
        </section>
      </div>
    </main>
    <footer className="public-footer"><span>GetYourFit</span><span>Counts of steps taken on this page are kept without cookies or identifiers.</span></footer>
  </div>;
}
