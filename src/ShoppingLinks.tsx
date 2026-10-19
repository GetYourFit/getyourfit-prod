import { useEffect, useId, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { shoppingSourceListSchema, suggestShopping, type ShopDepartment, type ShoppingPick, type ShoppingSource } from '../shared/shopping';
import { starterRoleName, type StarterInput, type StarterRole, type StarterRoleState } from '../shared/starter-plan';
import { wardrobeRequest } from './wardrobe-api';
import { Notice } from './ui';

let sourceRequest: Promise<ShoppingSource[]> | null = null;

function loadSources(): Promise<ShoppingSource[]> {
  sourceRequest ??= wardrobeRequest('/shopping-sources', shoppingSourceListSchema, undefined, 'GET').catch((cause: unknown) => {
    sourceRequest = null;
    throw cause;
  });
  return sourceRequest;
}

function money(value: number, currency: StarterInput['currency']): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function checkedOn(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

const departmentNames: Record<ShopDepartment, string> = { men: 'Men’s', women: 'Women’s' };
const roleNouns: Record<StarterRole, string> = { top: 'a top', bottom: 'a bottom', footwear: 'footwear', 'one-piece': 'a one-piece garment' };

export function ShoppingLinks({ input, roles }: { input: StarterInput; roles: StarterRoleState[] }) {
  const id = useId();
  const [sources, setSources] = useState<ShoppingSource[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [department, setDepartment] = useState<ShopDepartment | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadSources().then((items) => { if (mounted) { setSources(items); setFailed(false); } })
      .catch(() => { if (mounted) setFailed(true); });
    return () => { mounted = false; };
  }, [attempt]);

  const source = sources?.[0];
  const suggestion = source ? suggestShopping(source, input, roles, department) : null;
  if (suggestion?.kind === 'unavailable' && (suggestion.reason === 'zero-budget' || suggestion.reason === 'all-owned')) return null;
  if (sources && !source) return null;

  return <section className="shopping" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`} className="card-title">Where to shop for this outfit</h4>
    {failed && <Notice tone="error" role="alert"><p>Shopping links could not be loaded. Your plan is unaffected.</p><div><button className="button button-secondary" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Try loading shopping links again</button></div></Notice>}
    {!failed && !source && <p className="shopping-note" role="status">Loading shopping links…</p>}
    {source && suggestion?.kind === 'unavailable' && <p className="shopping-note">{suggestion.reason === 'currency'
      ? `Shopping links cover India only for now. ${source.retailer} sells in Indian rupees and delivers within India, and your plan uses ${input.currency}, so no shop is suggested.`
      : `${source.retailer}, the only shop we have checked so far, has no section for ${input.dressCode === 'formal' ? 'a formal dress code' : 'these needs'}, so no shop is suggested. Try the external search links above.`}</p>}
    {source && suggestion && suggestion.kind !== 'unavailable' && <>
      <p className="shopping-note">{source.retailer} is the only shop we have checked so far. It mostly sells sports and outdoor clothing, so another shop may suit your occasion better.</p>
      <fieldset className="shopping-department field-group">
        <legend className="field-label">Which {source.retailer} department should we open?</legend>
        <p id={`${id}-department-help`} className="field-hint">{source.retailer} groups clothes this way. Your choice only picks the sections below and is not saved.</p>
        <div className="chips">{(['men', 'women'] as const).map((value) => <label className="chip" key={value}><input type="radio" name={`${id}-department`} value={value} checked={department === value} aria-describedby={`${id}-department-help`} onChange={() => setDepartment(value)} />{departmentNames[value]}</label>)}</div>
      </fieldset>
      {suggestion.kind === 'picks' && <>
        <Notice id={`${id}-disclosure`} tone="info" title="We may earn a commission."><p>If you buy after opening a Browse link below, {source.retailer} may pay GetYourFit a commission through {source.affiliate.network}. Commission does not change which sections we suggest.</p></Notice>
        <ul className="shopping-picks" aria-label="Shopping links for each need">
          {suggestion.picks.map((pick) => <ShoppingPickRow key={pick.role} pick={pick} input={input} source={source} disclosureId={`${id}-disclosure`} />)}
        </ul>
        {!suggestion.complete && <p className="shopping-note">{source.retailer} cannot complete this outfit, so treat these links as partial help.</p>}
        <dl className="shopping-budget" aria-label="Shopping budget breakdown">
          <div><dt>Spending ceiling</dt><dd>{money(input.budget, input.currency)}</dd></div>
          <div><dt>Planning shares</dt><dd>{suggestion.picks.map((pick) => `${starterRoleName(pick.role)} ${pick.state === 'owned' ? 'already owned' : money(pick.allocation, input.currency)}`).join(' · ')}</dd></div>
          {!source.rights.prices && <div><dt>Item prices</dt><dd>Not shown. We do not have {source.retailer}’s permission to copy prices, so compare each price with its share yourself.</dd></div>}
          <div><dt>Delivery and taxes</dt><dd>Shown by {source.retailer} at checkout. Delivery can depend on your pincode and your cart.</dd></div>
          <div><dt>Checkout total</dt><dd>Unknown until checkout, so we cannot confirm this outfit fits your ceiling.</dd></div>
        </dl>
        <div className="shopping-limits">
          <p><strong>What we could not check:</strong> the garment you choose, its price, which sizes are available, delivery to your pincode, its return terms, and fit. Check the size guidance and return terms on each product page before you buy.</p>
          {!source.rights.images && <p>No product photos are shown because {source.retailer} has not given GetYourFit permission to display them.</p>}
          <p>Links carry no account or plan details, so GetYourFit cannot connect a purchase to you. A Browse link goes through {source.affiliate.network} ({source.affiliate.redirectHost}) to {source.retailer}, and both may use cookies and record your visit.</p>
          <p>Checked {checkedOn(source.verifiedAt)}: {source.retailer}’s affiliate programme on {source.affiliate.network} accepts links from GetYourFit.</p>
        </div>
      </>}
    </>}
  </section>;
}

function ShoppingPickRow({ pick, input, source, disclosureId }: { pick: ShoppingPick; input: StarterInput; source: ShoppingSource; disclosureId: string }) {
  const role = starterRoleName(pick.role);
  if (pick.state === 'owned') return <li><div><p className="shopping-pick-label">{role}</p><p>You confirmed you already have this, so there is no link.</p></div></li>;
  if (pick.state === 'unmatched') {
    return <li><div><p className="shopping-pick-label">{role}</p><p>No {source.retailer} section we checked fits {input.dressCode === 'formal' ? 'a formal dress code' : `${roleNouns[pick.role]} in this department`}. Try the external search above or another shop.</p></div></li>;
  }
  const { destination } = pick;
  const dressCode = input.dressCode === 'unknown' ? '' : ` for a ${input.dressCode} dress code`;
  return <li>
    <div>
      <p className="shopping-pick-label">{role}</p>
      <p className="shopping-section">{destination.label} at {source.retailer}</p>
      <p>The closest section we checked for {roleNouns[pick.role]}{dressCode}. It is a section to browse, not a chosen garment.</p>
      <p>Your planning share: {money(pick.allocation, input.currency)}.</p>
    </div>
    <div className="shopping-actions">
      <a className="shopping-link" href={destination.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer" aria-describedby={disclosureId}><span className="shopping-link-text">Browse {destination.label.charAt(0).toLowerCase()}{destination.label.slice(1)}</span><ArrowUpRight size={15} aria-hidden="true" /><span className="badge shopping-badge">Affiliate link</span><span className="visually-hidden"> (opens in a new tab)</span></a>
      <a className="shopping-direct" href={destination.url} target="_blank" rel="noopener noreferrer">Open without the affiliate link<span className="visually-hidden"> (opens in a new tab)</span></a>
    </div>
  </li>;
}
