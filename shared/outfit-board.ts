import { buildCapsule, starterRoleName, type StarterInput, type StarterRole, type StarterRoleState } from './starter-plan.ts';

// Every image is a real garment photograph from The Met Open Access collection (CC0). Provenance lives in public/example/provenance.json.
export type Garment = {
  id: string;
  role: StarterRole;
  caption: string;
  alt: string;
  file: string;
  width: number;
  height: number;
  backdrop: string;
  met: number;
};

export const garments: Garment[] = [
  { id: 'shirt', role: 'top', caption: 'Checked cotton shirt', alt: 'Checked cotton shirt from The Met collection', file: 'shirt', width: 900, height: 824, backdrop: '#b3ab93', met: 91159 },
  { id: 'sweater', role: 'top', caption: 'Ribbed wool sweater', alt: 'Cream ribbed wool sweater from The Met collection', file: 'sweater', width: 900, height: 712, backdrop: '#717273', met: 155791 },
  { id: 'trousers', role: 'bottom', caption: 'Cream cotton trousers', alt: 'Cream cotton trousers from The Met collection', file: 'trousers', width: 646, height: 1200, backdrop: '#969488', met: 91001 },
  { id: 'trousers-tan', role: 'bottom', caption: 'Tan cotton trousers', alt: 'Tan cotton trousers from The Met collection', file: 'trousers-tan', width: 613, height: 1200, backdrop: '#918d84', met: 90799 },
  { id: 'oxfords', role: 'footwear', caption: 'Leather lace-ups', alt: 'Brown leather lace-up shoes from The Met collection', file: 'oxfords', width: 728, height: 516, backdrop: '#cdc8ae', met: 90428 },
  { id: 'boots', role: 'footwear', caption: 'Black button boots', alt: 'Black wool button boots from The Met collection', file: 'boots', width: 900, height: 608, backdrop: '#d7d4d6', met: 158242 },
  { id: 'dress-blue', role: 'one-piece', caption: 'Blue silk dress', alt: 'Blue silk and cotton dress from The Met collection', file: 'dress-blue', width: 778, height: 1200, backdrop: '#d3cdca', met: 157729 },
  { id: 'dress-silk', role: 'one-piece', caption: 'Patterned silk dress', alt: 'Patterned silk dress from The Met collection', file: 'dress-silk', width: 598, height: 1200, backdrop: '#978b7a', met: 82122 },
];

export type BoardPiece =
  | { role: StarterRole; owned: false; label: string; garment: Garment }
  | { role: StarterRole; owned: true; label: string };
export type BoardLook = { name: string; pieces: BoardPiece[]; why: string };
export type OutfitBoard = { looks: BoardLook[]; reasons: string[] };

const byId = new Map(garments.map((garment) => [garment.id, garment]));

// Preferred order of options for each role; the capsule's "A" option is the first entry.
function preference(role: StarterRole, input: StarterInput): string[] {
  const cold = input.weather === 'cold';
  const formal = input.dressCode === 'formal' || input.dressCode === 'smart-casual';
  if (role === 'top') return cold ? ['sweater', 'shirt'] : ['shirt', 'sweater'];
  if (role === 'bottom') return ['trousers', 'trousers-tan'];
  if (role === 'footwear') return !formal && cold ? ['boots', 'oxfords'] : ['oxfords', 'boots'];
  return formal ? ['dress-silk', 'dress-blue'] : ['dress-blue', 'dress-silk'];
}

function money(value: number, currency: StarterInput['currency']): string {
  const locale = currency === 'INR' ? 'en-IN' : currency === 'GBP' ? 'en-GB' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function composeBoard(input: StarterInput, roles: StarterRoleState[]): OutfitBoard {
  const capsule = buildCapsule(input, roles);
  const pick = (role: StarterRole, label: string): Garment => {
    const option = label.endsWith(' B') ? 1 : 0;
    const garment = byId.get(preference(role, input)[option] ?? '');
    if (!garment) throw new Error(`No garment photograph for ${role}.`);
    return garment;
  };
  const looks = capsule.outfits.map((outfit, index): BoardLook => ({
    name: `Look ${index + 1}`,
    why: outfit.why,
    pieces: outfit.pieces.map((label, position): BoardPiece => {
      const role = roles[position]?.role;
      const piece = capsule.pieces[position];
      if (!role || !piece) throw new Error('A capsule outfit lists a piece without a role.');
      return piece.owned ? { role, owned: true, label } : { role, owned: false, label, garment: pick(role, label) };
    }),
  }));
  const planned = capsule.pieces.filter((piece) => !piece.owned);
  const pieceCount = planned.reduce((sum, piece) => sum + piece.count, 0);
  const reasons = [
    `Complete: ${roles.map((entry) => starterRoleName(entry.role).toLowerCase()).join(', ')} for ${input.occasion}.`,
    capsule.climate,
    input.dressCode === 'unknown' ? 'No dress code was given, so nothing here claims to suit one.' : `Options are ordered for your stated ${input.dressCode.replace('-', ' ')} dress code. Fabric and fit are not verified.`,
    planned.length === 0
      ? 'You already have every piece, so no spending is planned.'
      : input.budget === 0
        ? 'With no spending ceiling, reuse or borrow a similar piece for each tile.'
        : `Your ${money(input.budget, input.currency)} ceiling is shared across ${pieceCount} planned pieces that mix into ${looks.length} looks.`,
  ];
  return { looks, reasons };
}

// Tile positions as percentages of a square board, so the page and the downloadable image share one composition.
export type TileRect = { x: number; y: number; w: number; h: number };

export function layoutFor(pieces: BoardPiece[]): TileRect[] {
  if (pieces.some((piece) => piece.role === 'one-piece')) {
    return pieces.map((piece): TileRect => piece.role === 'one-piece' ? { x: 4, y: 4, w: 50, h: 92 } : { x: 57, y: 31.5, w: 39, h: 37 });
  }
  const spots: Record<string, TileRect> = {
    top: { x: 4, y: 4, w: 51, h: 52 },
    footwear: { x: 4, y: 59, w: 51, h: 37 },
    bottom: { x: 58, y: 4, w: 38, h: 92 },
  };
  return pieces.map((piece) => spots[piece.role] ?? { x: 4, y: 4, w: 92, h: 92 });
}

// A photograph fills its tile when the shapes nearly match; otherwise it is shown whole.
export function fitFor(garment: Garment, rect: TileRect): 'cover' | 'contain' {
  const photo = garment.width / garment.height;
  const tile = rect.w / rect.h;
  return Math.abs(photo / tile - 1) <= 0.3 ? 'cover' : 'contain';
}

export const garmentSources = (garment: Garment) => ({
  src: `/example/${garment.file}.webp`,
  srcSet: `/example/${garment.file}-360.webp 360w, /example/${garment.file}-600.webp 600w, /example/${garment.file}.webp ${garment.width}w`,
});
