// The only facts the visitor funnel records: which step happened, counted per UTC day. Nothing identifies a visitor, a plan or a guide.
export const funnelEvents = ['plan_opened', 'plan_submitted', 'outfit_shown', 'save_prompt_shown', 'save_prompt_accepted', 'plan_saved_after_visit', 'guide_viewed', 'guide_cta_clicked'] as const;
export type FunnelEvent = (typeof funnelEvents)[number];
