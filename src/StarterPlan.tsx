import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ArrowUpRight } from 'lucide-react';
import { starterInputSchema, starterPlanSchema, starterRoleName, buildStarterRoles, confirmStarterRole, type StarterInput, type StarterPlan, type StarterRole, type StarterRoleState } from '../shared/starter-plan';
import { wardrobeRequest } from './wardrobe-api';

type FormValues = Omit<StarterInput, 'budget'> & { budget: string };
type Draft = { input: StarterInput; roles: StarterRoleState[] };

const emptyValues: FormValues = {
  occasion: '', outfitType: 'separates', budget: '', currency: 'INR', weather: 'unknown', dressCode: 'unknown', mustHave: '', ownedRoles: [],
};
const planListSchema = z.array(starterPlanSchema);
const roleOptions: StarterRole[] = ['top', 'bottom', 'footwear'];

function eligibleRoles(input: FormValues): StarterRole[] {
  return input.outfitType === 'separates' ? roleOptions : ['one-piece', 'footwear'];
}

function displayBudget(value: number, currency: StarterInput['currency']): string {
  const locale = currency === 'INR' ? 'en-IN' : currency === 'GBP' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function searchHref(role: StarterRole): string {
  const terms: Record<StarterRole, string> = { top: 'clothing tops', bottom: 'clothing bottoms', footwear: 'footwear', 'one-piece': 'one-piece clothing' };
  return `https://www.google.com/search?q=${encodeURIComponent(terms[role])}`;
}

export function StarterPlan() {
  const [plans, setPlans] = useState<StarterPlan[]>([]);
  const [current, setCurrent] = useState<StarterPlan | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [formOpen, setFormOpen] = useState(true);
  const [replacePlan, setReplacePlan] = useState(false);
  const [editingRole, setEditingRole] = useState<StarterRole | null>(null);
  const [needText, setNeedText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    void wardrobeRequest('/starter-plans', planListSchema, undefined, 'GET').then((items) => {
      if (!mounted) return;
      setPlans(items);
      setCurrent(items.find((item) => item.status === 'active') ?? items[0] ?? null);
      setFormOpen(items.length === 0);
      setLoadFailed(false);
    }).catch((cause: unknown) => {
      if (mounted) {
        setError(cause instanceof Error ? cause.message : 'Your saved plans could not be opened.');
        setLoadFailed(true);
      }
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [loadAttempt]);


  function focusPlanAfterUpdate() {
    globalThis.requestAnimationFrame(() => globalThis.document.querySelector<HTMLElement>('#build-plan .starter-result h3')?.focus());
  }

  function setValue<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function act(action: string, callback: () => Promise<void>) {
    setBusy(action);
    setError('');
    setStatus('');
    try { await callback(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That plan change could not be saved. Try again.'); }
    finally { setBusy(''); }
  }

  function parseInput(): StarterInput {
    const result = starterInputSchema.safeParse({ ...values, budget: Number(values.budget) });
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(issue?.path[0] === 'occasion' ? 'Add the occasion to continue.' : issue?.path[0] === 'budget' ? 'Enter a whole-number budget from 0 to 1,000,000.' : 'Review the outfit needs and try again.');
    }
    return result.data;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await act('create', async () => {
      const input = parseInput();
      if (replacePlan && current) {
        const replacement = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'replace-plan', input }, 'PATCH');
        setPlans((items) => [replacement, ...items.map((item) => item.id === current.id ? { ...item, status: 'replaced' as const } : item)]);
        setCurrent(replacement);
        setDraft(null);
        setReplacePlan(false);
        setFormOpen(false);
        focusPlanAfterUpdate();
        setStatus('The previous plan is marked replaced. Your new plan is ready to review.');
      } else {
        const roles = buildStarterRoles(input, new Date().toISOString());
        setDraft({ input, roles });
        setFormOpen(false);
        focusPlanAfterUpdate();
        setStatus('Your text needs plan is ready. Save it to keep it in your account.');
      }
    });
  }

  async function saveDraft() {
    if (!draft) return;
    await act('save', async () => {
      const saved = await wardrobeRequest('/starter-plans', starterPlanSchema, draft.input);
      setPlans((items) => [saved, ...items]);
      setCurrent(saved);
      setDraft(null);
      focusPlanAfterUpdate();
      setStatus('Plan saved in your private GetYourFit account.');
    });
  }

  async function confirmOwned(role: StarterRole, input: StarterInput, roles: StarterRoleState[]) {
    if (current) {
      await act(`owned-${role}`, async () => {
        const saved = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'confirm-owned', role }, 'PATCH');
        setCurrent(saved);
        setPlans((items) => items.map((item) => item.id === saved.id ? saved : item));
        focusPlanAfterUpdate();
        setStatus(`You confirmed suitable ${starterRoleName(role).toLowerCase()} is yours. The owned wardrobe has not been changed.`);
      });
      return;
    }
    const updated = confirmStarterRole(roles, role, input.budget, new Date().toISOString());
    const ownedRoles = [...input.ownedRoles, role];
    const nextInput = starterInputSchema.parse({ ...input, ownedRoles });
    setDraft({ input: nextInput, roles: updated });
    focusPlanAfterUpdate();
    setStatus(`You confirmed suitable ${starterRoleName(role).toLowerCase()} is yours. Save the plan to keep that confirmation.`);
  }

  async function replaceNeed(role: StarterRole, input: StarterInput, roles: StarterRoleState[]) {
    if (!needText.trim()) { setError('Describe the replacement need before saving.'); return; }
    await act('replace-need', async () => {
      const need = z.string().trim().min(1).max(240).parse(needText);
      if (current) {
        const saved = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'replace-need', role, need }, 'PATCH');
        setCurrent(saved);
        setPlans((items) => items.map((item) => item.id === saved.id ? saved : item));
      } else {
        setDraft({ input, roles: roles.map((item) => item.role === role ? { ...item, need } : item) });
      }
      focusPlanAfterUpdate();
      setEditingRole(null);
      setNeedText('');
      setStatus('The need was replaced in this plan. It remains a text need, not a product offer.');
    });
  }

  async function rejectCurrent() {
    if (current) {
      await act('reject', async () => {
        const rejected = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'reject' }, 'PATCH');
        setCurrent(rejected);
        setPlans((items) => items.map((item) => item.id === rejected.id ? rejected : item));
        focusPlanAfterUpdate();
        setStatus('Plan rejected and recorded in your account. Your wardrobe was not changed.');
      });
    } else {
      setDraft(null);
      focusPlanAfterUpdate();
      setStatus('Plan rejected. Nothing was saved. Your wardrobe was not changed.');
    }
  }

  function startReplacement() {
    if (!current) return;
    setValues({ ...current.input, budget: String(current.input.budget) });
    setDraft(null);
    setReplacePlan(true);
    setFormOpen(true);
  }

  function startNewPlan() {
    setCurrent(null);
    setDraft(null);
    setValues(emptyValues);
    setReplacePlan(false);
    setFormOpen(true);
  }

  function renderPlan(input: StarterInput, roles: StarterRoleState[], saved: boolean, planStatus: StarterPlan['status'] | 'draft') {
    const allocated = roles.reduce((sum, role) => sum + role.allocation, 0);
    const remaining = roles.filter((role) => role.state === 'planned');
    const actionable = planStatus === 'active' || planStatus === 'draft';
    const heading = planStatus === 'rejected' ? 'Plan rejected' : planStatus === 'replaced' ? 'Replaced plan' : planStatus === 'draft' ? `Needs for ${input.occasion}` : `Your starter plan for ${input.occasion}`;
    return <div className="starter-result" key={`${planStatus}-${input.occasion}`}>
      <div className="starter-result-heading"><div><h3 tabIndex={-1}>{heading}</h3><p>{input.outfitType === 'separates' ? 'Top, bottom and footwear' : 'One-piece garment and footwear'} for one occasion.</p></div><span className={`starter-state starter-state-${planStatus}`}>{planStatus === 'active' ? 'Active plan' : planStatus === 'draft' ? 'Not saved yet' : planStatus}</span></div>
      {planStatus === 'active' && <p className="starter-explanation">This is a text needs plan, not a verified outfit or catalogue. No item images, prices, size charts, stock, shipping, or checkout amounts are available here. Your selected context is a starting point; no garment fit or availability is predicted.</p>}
      {planStatus !== 'active' && planStatus !== 'draft' && <p className="starter-explanation">This plan remains in your account history. Its needs are separate from your owned clothes.</p>}
      {planStatus === 'draft' && <p className="starter-explanation">One explained set of clothing needs for your occasion. You do not need to add garments or upload photos. Save the plan when it looks right.</p>}
      <div className="starter-context"><p><strong>Occasion:</strong> {input.occasion}</p><p><strong>Weather:</strong> {input.weather === 'unknown' ? 'Not provided' : input.weather} · <strong>Dress code:</strong> {input.dressCode === 'unknown' ? 'Not provided' : input.dressCode}</p>{input.mustHave && <p><strong>Your requirement:</strong> {input.mustHave}</p>}</div>
      {(input.weather === 'unknown' || input.dressCode === 'unknown' || input.mustHave) && <p className="starter-limit">Your plan records these constraints but cannot verify a garment against them.</p>}
      <div className="starter-budget" aria-label="Budget allocation breakdown">
        <p><strong>Spending ceiling:</strong> {displayBudget(input.budget, input.currency)}</p>
        <p><strong>Allocated across planned needs:</strong> {displayBudget(allocated, input.currency)}</p>
        <p className="starter-note">This is a planning allocation, split evenly across needs you have not marked owned. It is not a quote or a promise that an outfit is within budget. Size, delivery cost, taxes, and checkout total are unknown.</p>
      </div>
      {input.budget === 0 && remaining.length > 0 && <p className="starter-no-cash">With a zero spending ceiling, consider reusing something you have or asking whether someone can lend a suitable piece. Availability is not guaranteed.</p>}
      <ul className="starter-needs" aria-label="Clothing needs in this outfit plan">
        {roles.map((role) => <li key={role.role}>
          <div className="starter-need-copy"><p className="starter-need-label">{starterRoleName(role.role)}</p><p>{role.need}</p><p>{role.state === 'planned' ? `Planned need · allocation ${displayBudget(role.allocation, input.currency)}` : 'You confirmed a suitable item is already owned · allocation 0'}</p></div>
          {role.state === 'planned' && actionable && <div className="starter-need-actions">
            {input.budget > 0 && <a className="starter-search" href={searchHref(role.role)} target="_blank" rel="noopener noreferrer">Open an external search for {starterRoleName(role.role).toLowerCase()} <ArrowUpRight size={15} aria-hidden="true" /></a>}
            <button className="text-button" disabled={busy !== ''} onClick={() => { setEditingRole(role.role); setNeedText(role.need); }}>Replace need</button>
            <button className="text-button" disabled={busy !== ''} onClick={() => void confirmOwned(role.role, input, roles)}>I already have this</button>
            {editingRole === role.role && <form className="starter-replace-form" onSubmit={(event) => { event.preventDefault(); void replaceNeed(role.role, input, roles); }}>
              <label>Replacement need<textarea value={needText} maxLength={240} required onChange={(event) => setNeedText(event.target.value)} /></label>
              <button className="button button-secondary" disabled={busy !== ''}>{busy === 'replace-need' ? 'Saving…' : 'Save replacement'}</button>
              <button className="text-button" type="button" onClick={() => { setEditingRole(null); setNeedText(''); }}>Cancel</button>
            </form>}
          </div>}
        </li>)}
      </ul>
      {remaining.length === 0 && <p className="starter-no-cash">Every role is covered by your confirmation. No shopping is suggested for this plan.</p>}
      {remaining.length > 0 && actionable && <p className="starter-search-disclosure">External search links open a general search page. They do not name a seller or specific offer. The search service may collect information when you visit it; GetYourFit sends no occasion, budget, or other plan details in these links.</p>}
      <div className="starter-plan-actions">
        {planStatus === 'draft' && <button className="button button-primary" disabled={busy !== ''} onClick={() => void saveDraft()}>{busy === 'save' ? 'Saving plan…' : 'Save plan'}</button>}
        {saved && planStatus === 'active' && <button className="button button-secondary" disabled={busy !== ''} onClick={startReplacement}>Replace plan</button>}
        {planStatus === 'active' && <button className="text-button starter-reject" disabled={busy !== ''} onClick={() => void rejectCurrent()}>{busy === 'reject' ? 'Rejecting…' : 'Reject plan'}</button>}
        {planStatus === 'rejected' && <button className="button button-primary" onClick={startNewPlan}>Start a new plan</button>}
      </div>
    </div>;
  }

  const planHistory = plans.filter((plan) => plan.id !== current?.id);

  return <section className="starter-plan-section" id="build-plan" aria-labelledby="starter-plan-title">
    <div className="starter-plan-heading"><div><h2 id="starter-plan-title">Build my wardrobe</h2><p>Start with one outfit for what you need next. No garment upload or account at another service is needed to plan.</p></div>{!formOpen && !draft && (current ? <button className="button button-secondary" onClick={startNewPlan}>New plan</button> : <button className="button button-primary" onClick={() => setFormOpen(true)}>Plan an occasion</button>)}</div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loadFailed && <button className="button button-secondary starter-load-retry" onClick={() => { setLoading(true); setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }}>Try loading saved plans again</button>}
    {status && <p className="starter-status" role="status">{status}</p>}
    {loading ? <p role="status">Opening your saved plans…</p> : <>
      {!draft && current && renderPlan(current.input, current.roles, true, current.status)}
      {draft && renderPlan(draft.input, draft.roles, false, 'draft')}
      {!draft && current?.status === 'replaced' && <button className="button button-primary" onClick={startNewPlan}>Start a new plan</button>}
      {formOpen && <form className="starter-form" onSubmit={(event) => void submit(event)}>
        <h3>{replacePlan ? 'Change this plan' : current ? 'Plan another occasion' : 'Start with one occasion'}</h3>
        <p>Tell us what the outfit needs to cover. Unknown details stay unknown.</p>
        <label>What is the occasion?<input required maxLength={120} value={values.occasion} placeholder="For example, a family celebration" onChange={(event) => setValue('occasion', event.target.value)} /></label>
        <div className="starter-form-row">
          <label>Spending ceiling<input required type="number" min="0" max="1000000" step="1" inputMode="numeric" value={values.budget} onChange={(event) => setValue('budget', event.target.value)} /></label>
          <label>Currency<select value={values.currency} onChange={(event) => setValue('currency', z.enum(['INR', 'USD', 'GBP']).parse(event.target.value))}><option value="INR">INR · Indian rupee</option><option value="USD">USD · US dollar</option><option value="GBP">GBP · British pound</option></select></label>
        </div>
        <div className="starter-form-row">
          <label>Plan weather<select value={values.weather} onChange={(event) => setValue('weather', z.enum(['warm', 'mild', 'cold', 'unknown']).parse(event.target.value))}><option value="unknown">I am not sure</option><option value="warm">Warm</option><option value="mild">Mild</option><option value="cold">Cold</option></select></label>
          <label>Plan dress code<select value={values.dressCode} onChange={(event) => setValue('dressCode', z.enum(['casual', 'smart-casual', 'formal', 'unknown']).parse(event.target.value))}><option value="unknown">I am not sure</option><option value="casual">Casual</option><option value="smart-casual">Smart casual</option><option value="formal">Formal</option></select></label>
        </div>
        <label>What kind of outfit do you need?<select value={values.outfitType} onChange={(event) => { const outfitType = z.enum(['separates', 'one-piece']).parse(event.target.value); setValue('outfitType', outfitType); setValue('ownedRoles', values.ownedRoles.filter((role) => (outfitType === 'separates' ? roleOptions : ['one-piece', 'footwear']).includes(role))); }}><option value="separates">Top, bottom and footwear</option><option value="one-piece">One-piece garment and footwear</option></select></label>
        <label>Any must-have or coverage requirement? <span className="starter-optional">Optional</span><input type="text" maxLength={160} value={values.mustHave} aria-describedby="starter-requirement-help" onChange={(event) => setValue('mustHave', event.target.value)} /></label>
        <p className="starter-form-note" id="starter-requirement-help">Add only a clothing requirement you want reflected in the text needs plan.</p>
        <fieldset className="starter-owned"><legend>Do you already have a suitable item for any of these needs?</legend><p>Only your confirmation can close a gap. This does not add a photo or garment to your owned wardrobe.</p>{eligibleRoles(values).map((role) => <label key={role}><input type="checkbox" checked={values.ownedRoles.includes(role)} onChange={(event) => setValue('ownedRoles', event.target.checked ? [...values.ownedRoles, role] : values.ownedRoles.filter((item) => item !== role))} /> I already have suitable {starterRoleName(role).toLowerCase()}</label>)}</fieldset>
        <p className="starter-form-note">The result is a text needs plan. We do not have an authorized product catalogue, so we cannot verify products, offers, prices, size, delivery, or checkout totals.</p>
        <div className="starter-form-actions"><button className="button button-primary" disabled={busy !== ''}>{busy === 'create' ? 'Making your plan…' : replacePlan ? 'Replace with this plan' : 'Make my starter plan'}</button><button className="text-button" type="button" onClick={() => { setFormOpen(false); setReplacePlan(false); }}>{current || draft ? 'Cancel' : 'Use my owned clothes instead'}</button></div>
      </form>}
      {planHistory.length > 0 && <details className="starter-history"><summary>Saved plan history ({planHistory.length})</summary><ul>{planHistory.map((plan) => <li key={plan.id}><button className="text-button" onClick={() => { setCurrent(plan); setDraft(null); setFormOpen(false); }}>{plan.input.occasion} · {plan.status}</button></li>)}</ul></details>}
    </>}
  </section>;
}
