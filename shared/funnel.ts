// The only facts the visitor funnel records: which step happened, counted per UTC day. Nothing identifies a visitor or a plan.
export const funnelEvents = ['plan_opened', 'plan_submitted', 'outfit_shown', 'save_prompt_shown', 'save_prompt_accepted', 'plan_saved_after_visit'] as const;
export type FunnelEvent = (typeof funnelEvents)[number];
