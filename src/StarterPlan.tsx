import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ArrowUpRight } from 'lucide-react';
import { STARTER_NEED_MAX_LENGTH, starterNeedSchema, starterInputSchema, starterPlanSchema, starterWeatherSchema, buildCapsule, withCarriedLook, PLAN_ACCOUNT_MISMATCH, starterRoleName, buildStarterRoles, confirmStarterRole, type StarterInput, type StarterPlan, type StarterRole, type StarterRoleState } from '../shared/starter-plan';
import { composeBoard } from '../shared/outfit-board';
import { countStep } from './funnel';
import { OutfitBoardPanel } from './OutfitBoard';
import { claimPendingPlan, clearPendingPlan, discardPendingPlan, updatePendingLook } from './pending-plan';
import { ShoppingLinks } from './ShoppingLinks';
import { wardrobeRequest } from './wardrobe-api';
import { Notice } from './ui';
import { requireSession } from './session';

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

export function StarterPlan({ account, onPresenceChange }: { account: string; onPresenceChange?: (present: boolean) => void }) {
  const [initialVisit] = useState(() => claimPendingPlan(account));
  const fromVisit = useRef(initialVisit);
  const [plans, setPlans] = useState<StarterPlan[]>([]);
  const [current, setCurrent] = useState<StarterPlan | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => initialVisit ? { input: initialVisit.input, roles: buildStarterRoles(initialVisit.input, new Date().toISOString()) } : null);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [formOpen, setFormOpen] = useState(!initialVisit);
  const [replacePlan, setReplacePlan] = useState(false);
  const [editingRole, setEditingRole] = useState<StarterRole | null>(null);
  const [needText, setNeedText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const present = current?.input.selectedLook !== undefined || draft?.input.selectedLook !== undefined;
  useEffect(() => { onPresenceChange?.(present); }, [present, onPresenceChange]);

  useEffect(() => {
    let mounted = true;
    void wardrobeRequest('/starter-plans', planListSchema, undefined, 'GET').then((items) => {
      if (!mounted) return;
      setPlans(items);
      setError('');
      setLoadFailed(false);
      const visit = fromVisit.current;
      if (!visit) {
        setCurrent(items.find((item) => item.status === 'active') ?? items[0] ?? null);
        setFormOpen(items.length === 0);
        return;
      }
      setFormOpen(false);
      setBusy('save');
      return (async () => {
        try {
          const stored = items.find((item) => item.id === visit.id)
            ?? await wardrobeRequest('/starter-plans', starterPlanSchema, { ...visit.input, requestId: visit.id, expectedUserId: visit.account });
          const saved = await matchLook(stored, visit.input.selectedLook);
          if (!mounted) return;
          setPlans((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
          setCurrent(saved);
          setDraft(null);
          clearPendingPlan(visit.id);
          fromVisit.current = null;
          countStep('plan_saved_after_visit');
          setStatus('Plan saved in your private GetYourFit account, including your chosen look.');
        } catch (cause) {
          if (!mounted) return;
          if (cause instanceof Error && cause.message === PLAN_ACCOUNT_MISMATCH) { forgetVisit(); setCurrent(items.find((item) => item.status === 'active') ?? items[0] ?? null); setFormOpen(items.length === 0); setError(PLAN_ACCOUNT_MISMATCH); }
          else setError('Your plan could not be saved. Your chosen look is still here. Try saving again.');
        } finally { if (mounted) setBusy(''); }
      })();
    }).catch((cause: unknown) => {
      if (mounted) {
        setError(cause instanceof Error ? cause.message : 'Your saved plans could not be opened.');
        setLoadFailed(true);
      }
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (loading || !current) return;
    globalThis.requestAnimationFrame(() => document.querySelector<HTMLElement>('#build-plan .starter-result h3')?.focus());
  }, [loading, current]);


  async function matchLook(plan: StarterPlan, wanted: number | undefined): Promise<StarterPlan> {
    if (wanted === undefined || plan.status !== 'active' || plan.input.selectedLook === wanted) return plan;
    return wardrobeRequest(`/starter-plans/${plan.id}`, starterPlanSchema, { action: 'choose-look', index: wanted }, 'PATCH');
  }

  function forgetVisit() {
    discardPendingPlan();
    fromVisit.current = null;
    setDraft(null);
  }

  function focusPlanAfterUpdate() {
    globalThis.requestAnimationFrame(() => globalThis.document.querySelector<HTMLElement>('#build-plan .starter-result h3, #build-plan .starter-form h3')?.focus());
  }

  function closeNeedEditor() {
    setEditingRole(null);
    setNeedText('');
  }

  function setValue<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function act(action: string, callback: () => Promise<void>) {
    setBusy(action);
    setError('');
    setStatus('');
    try { await requireSession(account); await callback(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That plan change could not be saved. Try again.'); }
    finally { setBusy(''); }
  }

  function parseInput(): StarterInput {
    const result = starterInputSchema.safeParse({ ...values, budget: Number(values.budget), ownedRoles: values.ownedRoles.filter((role) => eligibleRoles(values).includes(role)) });
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
        closeNeedEditor();
        setReplacePlan(false);
        setFormOpen(false);
        focusPlanAfterUpdate();
        setStatus('The previous plan is marked replaced. Your new plan is ready to review.');
      } else {
        const roles = buildStarterRoles(input, new Date().toISOString());
        forgetVisit();
        setCurrent(null);
        setDraft({ input, roles });
        closeNeedEditor();
        setFormOpen(false);
        focusPlanAfterUpdate();
        setStatus('Your text needs plan is ready. Save it to keep it in your account.');
      }
    });
  }

  async function saveDraft() {
    if (!draft) return;
    await act('save', async () => {
      const visit = fromVisit.current;
      let saved: StarterPlan;
      try {
        const stored = await wardrobeRequest('/starter-plans', starterPlanSchema, { ...draft.input, needs: draft.roles.map(({ role, need }) => ({ role, need })), ...(visit ? { requestId: visit.id, expectedUserId: visit.account } : {}) });
        saved = await matchLook(stored, draft.input.selectedLook);
      } catch (cause) {
        if (cause instanceof Error && cause.message === PLAN_ACCOUNT_MISMATCH) { forgetVisit(); setFormOpen(true); }
        throw cause;
      }
      setPlans((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setCurrent(saved);
      setDraft(null);
      closeNeedEditor();
      focusPlanAfterUpdate();
      setStatus('Plan saved in your private GetYourFit account.');
      if (fromVisit.current) { clearPendingPlan(fromVisit.current.id); fromVisit.current = null; countStep('plan_saved_after_visit'); }
    });
  }

  async function confirmOwned(role: StarterRole, input: StarterInput, roles: StarterRoleState[]) {
    if (current) {
      await act(`owned-${role}`, async () => {
        const saved = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'confirm-owned', role }, 'PATCH');
        setCurrent(saved);
        if (replacePlan) {
          setValues((previous) => !previous.ownedRoles.includes(role)
            ? { ...previous, ownedRoles: [...previous.ownedRoles, role] }
            : previous);
        }
        setPlans((items) => items.map((item) => item.id === saved.id ? saved : item));
        focusPlanAfterUpdate();
        setStatus(`You confirmed suitable ${starterRoleName(role).toLowerCase()} is yours. The owned wardrobe has not been changed.`);
      });
      return;
    }
    const updated = confirmStarterRole(roles, role, input.budget, new Date().toISOString());
    const ownedRoles = [...input.ownedRoles, role];
    const nextInput = starterInputSchema.parse(withCarriedLook({ ...input, ownedRoles }, { input, roles }, updated));
    setDraft({ input: nextInput, roles: updated });
    focusPlanAfterUpdate();
    setStatus(`You confirmed suitable ${starterRoleName(role).toLowerCase()} is yours. Save the plan to keep that confirmation.`);
  }

  async function replaceNeed(role: StarterRole, input: StarterInput, roles: StarterRoleState[]) {
    if (!needText.trim()) { setError('Describe the replacement need before saving.'); return; }
    await act('replace-need', async () => {
      const need = starterNeedSchema.parse(needText);
      if (current) {
        const saved = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'replace-need', role, need }, 'PATCH');
        setCurrent(saved);
        setPlans((items) => items.map((item) => item.id === saved.id ? saved : item));
      } else {
        setDraft({ input, roles: roles.map((item) => item.role === role ? { ...item, need } : item) });
      }
      focusPlanAfterUpdate();
      closeNeedEditor();
      setStatus('The need was replaced in this plan. It remains a text need, not a product offer.');
    });
  }

  async function rejectCurrent() {
    if (current) {
      await act('reject', async () => {
        const rejected = await wardrobeRequest(`/starter-plans/${current.id}`, starterPlanSchema, { action: 'reject' }, 'PATCH');
        setCurrent(rejected);
        setFormOpen(false);
        setReplacePlan(false);
        closeNeedEditor();
        setPlans((items) => items.map((item) => item.id === rejected.id ? rejected : item));
        focusPlanAfterUpdate();
        setStatus('Plan rejected and recorded in your account. Your wardrobe was not changed.');
      });
    } else {
      forgetVisit();
      setFormOpen(true);
      setReplacePlan(false);
      closeNeedEditor();
      focusPlanAfterUpdate();
      setStatus('Plan rejected. Nothing was saved. Your wardrobe was not changed.');
    }
  }

  function chooseLook(index: number) {
    setDraft((previous) => previous ? { ...previous, input: { ...previous.input, selectedLook: index } } : previous);
    const visit = fromVisit.current;
    if (!visit) return;
    fromVisit.current = { ...visit, input: { ...visit.input, selectedLook: index } };
    updatePendingLook(visit.id, index);
  }

  async function chooseSavedLook(plan: StarterPlan, index: number) {
    await act('look', async () => {
      const saved = await wardrobeRequest(`/starter-plans/${plan.id}`, starterPlanSchema, { action: 'choose-look', index }, 'PATCH');
      setCurrent(saved);
      setPlans((items) => items.map((item) => item.id === saved.id ? saved : item));
    });
  }

  function startReplacement() {
    if (!current) return;
    forgetVisit();
    const planValues = { ...current.input };
    delete planValues.selectedLook;
    setValues({ ...planValues, budget: String(current.input.budget), ownedRoles: current.roles.filter((role) => role.state === 'confirmed-owned').map((role) => role.role) });
    setDraft(null);
    setReplacePlan(true);
    setFormOpen(true);
  }

  function startNewPlan() {
    forgetVisit();
    setCurrent(null);
    setDraft(null);
    closeNeedEditor();
    setValues(emptyValues);
    setReplacePlan(false);
    setFormOpen(true);
  }

  function renderPlan(input: StarterInput, roles: StarterRoleState[], saved: boolean, planStatus: StarterPlan['status'] | 'draft') {
    const capsule = buildCapsule(input, roles);
    const allocated = roles.reduce((sum, role) => sum + role.allocation, 0);
    const remaining = roles.filter((role) => role.state === 'planned');
    const actionable = planStatus === 'active' || planStatus === 'draft';
    const visitorPlan = input.selectedLook !== undefined;
    const heading = planStatus === 'rejected' ? 'Plan rejected' : planStatus === 'replaced' ? 'Replaced plan' : planStatus === 'draft' ? `Needs for ${input.occasion}` : `Your starter plan for ${input.occasion}`;
    const details = <>
      {visitorPlan && saved && <button className="button button-secondary" disabled={busy !== ''} onClick={startNewPlan}>New plan</button>}
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
      {!visitorPlan && <OutfitBoardPanel account={account} key={`${input.occasion}-${roles.map((role) => role.state).join()}`} input={input} board={composeBoard(input, roles)} />}
      <div className="starter-capsule" aria-label="Starter capsule">
        <h4>Your starter capsule</h4>
        <p className="starter-note">{capsule.climate} These are general suggestions built from what you told us, not a verified fit, a taste prediction, or a shopping list for a specific product.</p>
        <ul className="starter-capsule-pieces" aria-label="Capsule pieces and budget share">
          {capsule.pieces.map((piece) => <li key={piece.role}>{piece.owned ? `${starterRoleName(piece.role)}: the one you already have` : `${piece.count} × ${starterRoleName(piece.role).toLowerCase()} · about ${displayBudget(piece.perPiece, input.currency)} each as a planning share`}</li>)}
        </ul>
        <ol className="starter-outfits" aria-label="Outfits from this capsule">
          {capsule.outfits.map((outfit) => <li key={outfit.name}><p className="starter-need-label">{outfit.name}</p><p>{outfit.pieces.join(' + ')}</p><p>{outfit.why}</p></li>)}
        </ol>
      </div>
      <ul className="starter-needs" aria-label="Clothing needs in this outfit plan">
        {roles.map((role) => <li key={role.role}>
          <div className="starter-need-copy"><p className="starter-need-label">{starterRoleName(role.role)}</p><p>{role.need}</p><p>{role.state === 'planned' ? `Planned need · allocation ${displayBudget(role.allocation, input.currency)}` : 'You confirmed a suitable item is already owned · allocation 0'}</p></div>
          {role.state === 'planned' && actionable && <div className="starter-need-actions">
            {input.budget > 0 && <a className="starter-search" href={searchHref(role.role)} target="_blank" rel="noopener noreferrer">Open an external search for {starterRoleName(role.role).toLowerCase()} <ArrowUpRight size={15} aria-hidden="true" /></a>}
            <button className="button button-ghost" disabled={busy !== ''} onClick={() => { setEditingRole(role.role); setNeedText(role.need); }}>Replace need</button>
            <button className="button button-ghost" disabled={busy !== ''} onClick={() => void confirmOwned(role.role, input, roles)}>I already have this</button>
            {editingRole === role.role && <form className="starter-replace-form" onSubmit={(event) => { event.preventDefault(); void replaceNeed(role.role, input, roles); }}>
              <label>Replacement need<textarea className="textarea" disabled={busy !== ''} value={needText} maxLength={STARTER_NEED_MAX_LENGTH} required onChange={(event) => setNeedText(event.target.value)} /></label>
              <button className="button button-secondary" disabled={busy !== ''}>{busy === 'replace-need' ? 'Saving…' : 'Save replacement'}</button>
              <button className="button button-ghost" type="button" disabled={busy !== ''} onClick={closeNeedEditor}>Cancel</button>
            </form>}
          </div>}
        </li>)}
      </ul>
      {remaining.length === 0 && <p className="starter-no-cash">Every role is covered by your confirmation. No shopping is suggested for this plan.</p>}
      {remaining.length > 0 && actionable && <p className="starter-search-disclosure">External search links open a general search page. They do not name a seller or specific offer. The search service may collect information when you visit it; GetYourFit sends no occasion, budget, or other plan details in these links.</p>}
      {remaining.length > 0 && actionable && input.budget > 0 && <ShoppingLinks input={input} roles={roles} />}
      <div className="starter-plan-actions">
        {planStatus === 'draft' && <button className="button button-primary" disabled={busy !== ''} onClick={() => void saveDraft()}>{busy === 'save' ? 'Saving plan…' : 'Save plan'}</button>}
        {saved && planStatus === 'active' && <button className="button button-secondary" disabled={busy !== ''} onClick={startReplacement}>Replace plan</button>}
        {actionable && <button className="button button-danger-ghost starter-reject" disabled={busy !== ''} onClick={() => void rejectCurrent()}>{busy === 'reject' ? 'Rejecting…' : 'Reject plan'}</button>}
        {planStatus === 'rejected' && <button className="button button-primary" disabled={busy !== ''} onClick={startNewPlan}>Start a new plan</button>}
      </div>
    </>;
    return <div className="starter-result" key={`${planStatus}-${input.occasion}`}>
      <div className="starter-result-heading"><div><h3 tabIndex={-1}>{heading}</h3>{!visitorPlan && <p>{input.outfitType === 'separates' ? 'Top, bottom and footwear' : 'One-piece garment and footwear'} for one occasion.</p>}</div><span className={`starter-state starter-state-${planStatus}`}>{planStatus === 'active' ? visitorPlan ? 'Saved' : 'Active plan' : planStatus === 'draft' ? 'Not saved yet' : planStatus}</span></div>
      {visitorPlan ? <>
        <p className="starter-explanation">Example garment photos, not clothes you own. Fit and availability are unverified.</p>
        <OutfitBoardPanel account={account} key={`${current?.id ?? 'draft'}-${roles.map((role) => role.state).join()}`} input={input} board={composeBoard(input, roles)} selection={{ onPending: (pending) => setBusy((previous) => pending ? 'look' : previous === 'look' ? '' : previous), index: input.selectedLook ?? 0, disabled: busy !== '' || loading || planStatus !== 'active' && planStatus !== 'draft', onChange: (index) => current && saved ? chooseSavedLook(current, index) : chooseLook(index) }} />
        {saved ? <details className="disclosure starter-details"><summary>Review needs and plan details</summary>{details}</details>
          : !loadFailed && <button className="button button-primary" disabled={busy !== '' || loading} onClick={() => void saveDraft()}>{busy === 'save' ? 'Saving plan…' : 'Try saving plan again'}</button>}
      </> : details}
    </div>;
  }

  const planHistory = plans.filter((plan) => plan.id !== current?.id);
  const visitorPlan = current?.input.selectedLook !== undefined || draft?.input.selectedLook !== undefined;

  return <section className="starter-plan-section page-section card" id="build-plan" aria-labelledby="starter-plan-title">
    <div className="starter-plan-heading"><div><h2 id="starter-plan-title" className="section-title">{visitorPlan ? current ? 'Your saved plan' : 'Your chosen plan' : 'Build my wardrobe'}</h2>{!visitorPlan && <p>Answer a few questions to get a starter capsule: a small set of pieces that mix into several outfits. No garment upload or account at another service is needed to plan.</p>}</div>{!formOpen && !draft && !visitorPlan && (current ? <button className="button button-secondary" disabled={busy !== ''} onClick={startNewPlan}>New plan</button> : <button className="button button-primary" disabled={busy !== ''} onClick={() => setFormOpen(true)}>Plan an occasion</button>)}</div>
    {error && <Notice tone="error" role="alert">{error}</Notice>}
    {loadFailed && <button className="button button-secondary starter-load-retry" disabled={busy !== ''} onClick={() => { setLoading(true); setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }}>Try loading saved plans again</button>}
    {status && <p className={visitorPlan ? 'visually-hidden' : 'starter-status'} role="status">{status}</p>}
    {loading && <p role="status">{busy === 'save' ? 'Saving your chosen plan…' : 'Opening your saved plans…'}</p>}
    {(!loading || draft) && <>
      {!draft && current && renderPlan(current.input, current.roles, true, current.status)}
      {draft && renderPlan(draft.input, draft.roles, false, 'draft')}
      {!draft && current?.status === 'replaced' && <button className="button button-primary" disabled={busy !== ''} onClick={startNewPlan}>Start a new plan</button>}
      {formOpen && <form className="starter-form" onSubmit={(event) => void submit(event)}>
        <h3 tabIndex={-1}>{replacePlan ? 'Change this plan' : current ? 'Plan another capsule' : 'Start with your occasion'}</h3>
        <p>Tell us what the outfit needs to cover. Unknown details stay unknown.</p>
        <label>What is the occasion?<input className="input" disabled={busy !== ''} required maxLength={120} value={values.occasion} placeholder="For example: a family function" onChange={(event) => setValue('occasion', event.target.value)} /></label>
        <div className="starter-form-row">
          <label>Spending ceiling<input className="input" disabled={busy !== ''} required type="number" min="0" max="1000000" step="1" inputMode="numeric" value={values.budget} onChange={(event) => setValue('budget', event.target.value)} /></label>
          <label>Currency<select className="select" disabled={busy !== ''} value={values.currency} onChange={(event) => setValue('currency', z.enum(['INR', 'USD', 'GBP']).parse(event.target.value))}><option value="INR">INR · Indian rupee</option><option value="USD">USD · US dollar</option><option value="GBP">GBP · British pound</option></select></label>
        </div>
        <div className="starter-form-row">
          <label>Plan weather<select className="select" disabled={busy !== ''} value={values.weather} onChange={(event) => setValue('weather', starterWeatherSchema.parse(event.target.value))}><option value="unknown">I am not sure</option><option value="warm">Warm</option><option value="mild">Mild</option><option value="cold">Cold</option></select></label>
          <label>Plan dress code<select className="select" disabled={busy !== ''} value={values.dressCode} onChange={(event) => setValue('dressCode', z.enum(['casual', 'smart-casual', 'formal', 'unknown']).parse(event.target.value))}><option value="unknown">I am not sure</option><option value="casual">Casual</option><option value="smart-casual">Smart casual</option><option value="formal">Formal</option></select></label>
        </div>
        <label>What kind of outfit do you need?<select className="select" disabled={busy !== ''} value={values.outfitType} onChange={(event) => setValue('outfitType', z.enum(['separates', 'one-piece']).parse(event.target.value))}><option value="separates">Top, bottom and footwear</option><option value="one-piece">One-piece garment and footwear</option></select></label>
        <label><span>Any must-have or coverage requirement? <span className="field-optional">(optional)</span></span><input className="input" disabled={busy !== ''} type="text" maxLength={160} value={values.mustHave} aria-describedby="starter-requirement-help" onChange={(event) => setValue('mustHave', event.target.value)} /></label>
        <p className="starter-form-note" id="starter-requirement-help">Add only a clothing requirement you want reflected in the text needs plan.</p>
        <fieldset className="starter-owned" disabled={busy !== ''}><legend>Do you already have a suitable item for any of these needs?</legend><p>Only your confirmation can close a gap. This does not add a photo or garment to your owned wardrobe.</p>{eligibleRoles(values).map((role) => <label className="check" key={role}><input type="checkbox" checked={values.ownedRoles.includes(role)} onChange={(event) => setValue('ownedRoles', event.target.checked ? [...values.ownedRoles, role] : values.ownedRoles.filter((item) => item !== role))} /> I already have suitable {starterRoleName(role).toLowerCase()}</label>)}</fieldset>
        <p className="starter-form-note">The result is a text needs plan. We do not have an authorized product catalogue, so we cannot verify products, offers, prices, size, delivery, or checkout totals.</p>
        <div className="starter-form-actions"><button className="button button-primary" disabled={busy !== ''}>{busy === 'create' ? 'Making your plan…' : replacePlan ? 'Replace with this plan' : 'Make my starter plan'}</button><button className="button button-ghost" type="button" disabled={busy !== ''} onClick={() => { setFormOpen(false); setReplacePlan(false); }}>{current || draft ? 'Cancel' : 'Use my owned clothes instead'}</button></div>
      </form>}
      {planHistory.length > 0 && <details className="starter-history"><summary>Saved plan history ({planHistory.length})</summary><ul>{planHistory.map((plan) => <li key={plan.id}><button className="button button-ghost" disabled={busy !== ''} onClick={() => { forgetVisit(); setCurrent(plan); setFormOpen(false); setReplacePlan(false); closeNeedEditor(); }}>{plan.input.occasion} · {plan.status}</button></li>)}</ul></details>}
    </>}
  </section>;
}
