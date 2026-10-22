import { buildCapsule, starterRoleName, type StarterInput, type StarterRole, type StarterRoleState } from './starter-plan.ts';

// Source licences and transformations are recorded in public/example/provenance.json.
export type Garment = {
  id: string;
  role: StarterRole;
  caption: string;
  alt: string;
  file: string;
  width: number;
  height: number;
  backdrop: string;
  source: string;
  author: string;
  license: string;
  licenseUrl: string;
};

export const garments: Garment[] = [
  { id: 'pumps', role: 'footwear', caption: 'Black low-heel pumps', alt: 'A pair of black low-heel pumps', file: 'pumps', width: 900, height: 600, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=157167994', author: 'W.carter', license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'shirt', role: 'top', caption: 'Checked short-sleeve shirt', alt: 'Checked short-sleeve shirt', file: 'shirt', width: 900, height: 824, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=11128591', author: 'Labegola', license: 'CC-BY-SA-3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0' },
  { id: 'sweater', role: 'top', caption: 'Textured crew-neck sweater', alt: 'Textured crew-neck sweater', file: 'sweater', width: 900, height: 824, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=46436817', author: 'Robert Sheie', license: 'CC-BY-2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0' },
  { id: 'trousers', role: 'bottom', caption: 'Stone chinos', alt: 'Stone chinos', file: 'trousers', width: 646, height: 1200, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=5999345', author: 'Kuha455405', license: 'CC-BY-SA-3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  { id: 'trousers-tan', role: 'bottom', caption: 'Dark denim jeans', alt: 'Dark denim jeans', file: 'trousers-tan', width: 646, height: 1200, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=92609887', author: 'CMFong2', license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0' },
  { id: 'oxfords', role: 'footwear', caption: 'Brown leather derbies', alt: 'Brown leather derbies', file: 'oxfords', width: 900, height: 600, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=91031796', author: '森奥伸之介', license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0' },
  { id: 'boots', role: 'footwear', caption: 'Blue knit trainers', alt: 'Blue knit trainers', file: 'boots', width: 900, height: 600, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=94535286', author: 'dfgfdd', license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0' },
  { id: 'dress-blue', role: 'one-piece', caption: 'Blue satin dress', alt: 'Blue satin dress', file: 'dress-blue', width: 778, height: 1200, backdrop: '#ffffff', source: 'https://commons.wikimedia.org/?curid=15781533', author: 'Tibald', license: 'CC-BY-SA-3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0' },
  { id: 'dress-silk', role: 'one-piece', caption: 'Black long-sleeve dress', alt: 'Black long-sleeve dress', file: 'dress-silk', width: 778, height: 1200, backdrop: '#ffffff', source: 'https://www.pexels.com/photo/black-dress-on-cloth-hanger-19895964/', author: 'Marcelo Verfe', license: 'Pexels', licenseUrl: 'https://www.pexels.com/license/' },
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
  if (role === 'footwear') {
    if (input.outfitType === 'one-piece') return ['pumps', 'boots'];
    return !formal && cold ? ['boots', 'oxfords'] : ['oxfords', 'boots'];
  }
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

export const garmentSources = (garment: Garment) => ({
  src: `/example/${garment.file}.webp`,
  srcSet: `/example/${garment.file}-360.webp 360w, /example/${garment.file}-600.webp 600w, /example/${garment.file}.webp ${garment.width}w`,
});
