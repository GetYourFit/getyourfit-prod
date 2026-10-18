import type { Facts } from '../shared/wardrobe';

export const categoryLabel: Record<Facts['category'], string> = { top: 'Top', bottom: 'Bottom', 'one-piece': 'One-piece', footwear: 'Footwear' };
export const weatherLabel: Record<Facts['weather'][number], string> = { warm: 'Warm', mild: 'Mild', cold: 'Cold' };
export const dressCodeLabel: Record<Facts['dressCode'][number], string> = { casual: 'Casual', 'smart-casual': 'Smart casual', formal: 'Formal' };
export const fitLabel: Record<Facts['fit'], string> = { fits: 'Fits you', unknown: 'Fit not confirmed', 'does-not-fit': 'Does not fit' };
