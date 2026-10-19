import { fitFor, layoutFor, type BoardLook } from '../shared/outfit-board';
import { starterRoleName } from '../shared/starter-plan';

const SIZE = 1080;
const MARGIN = 60;
const BOARD = SIZE - MARGIN * 2;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A garment photograph could not be loaded.'));
    image.src = src;
  });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath();
  context.roundRect(x, y, w, h, r);
}

// Draws the same composition the page shows, with the plan's context above it and the photo credit below, as a shareable PNG.
export async function renderBoardImage(look: BoardLook, title: string, subtitle: string): Promise<Blob> {
  await document.fonts.load('600 40px Manrope');
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = 1570;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw the image.');
  context.fillStyle = '#f7f8f5';
  context.fillRect(0, 0, SIZE, canvas.height);
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#1d2724';
  context.font = '600 52px Manrope, sans-serif';
  context.fillText(title.length > 34 ? `${title.slice(0, 33)}…` : title, MARGIN, 120);
  context.fillStyle = '#56645d';
  context.font = '500 30px Manrope, sans-serif';
  context.fillText(subtitle, MARGIN, 172);

  const top = 220;
  context.fillStyle = '#ffffff';
  roundRect(context, MARGIN, top, BOARD, BOARD, 32);
  context.fill();
  context.strokeStyle = '#dde3df';
  context.lineWidth = 2;
  context.stroke();
  const rects = layoutFor(look.pieces);
  const images = await Promise.all(look.pieces.map((piece) => piece.owned ? null : load(`/example/${piece.garment.file}.webp`)));
  look.pieces.forEach((piece, index) => {
    const rect = rects[index];
    if (!rect) return;
    const x = MARGIN + (rect.x / 100) * BOARD;
    const y = top + (rect.y / 100) * BOARD;
    const w = (rect.w / 100) * BOARD;
    const h = (rect.h / 100) * BOARD;
    context.save();
    roundRect(context, x, y, w, h, 20);
    context.clip();
    const image = images[index];
    if (piece.owned || !image) {
      context.fillStyle = '#f0f3ef';
      context.fillRect(x, y, w, h);
      context.restore();
      context.setLineDash([12, 10]);
      context.strokeStyle = '#7f8f85';
      context.lineWidth = 3;
      roundRect(context, x + 1.5, y + 1.5, w - 3, h - 3, 20);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#1d2724';
      context.font = '600 28px Manrope, sans-serif';
      context.textAlign = 'center';
      context.fillText(`Your own ${starterRoleName(piece.role).toLowerCase()}`, x + w / 2, y + h / 2 + 10);
      context.textAlign = 'left';
      return;
    }
    context.fillStyle = piece.garment.backdrop;
    context.fillRect(x, y, w, h);
    const scale = (fitFor(piece.garment, rect) === 'cover' ? Math.max : Math.min)(w / image.naturalWidth, h / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    context.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
    context.restore();
  });

  context.fillStyle = '#1d2724';
  context.font = '700 34px Manrope, sans-serif';
  context.fillText('GetYourFit', MARGIN, top + BOARD + 72);
  context.fillStyle = '#56645d';
  context.font = '500 20px Manrope, sans-serif';
  context.fillText('Stand-in garment photographs. Cropped and resized; source licences retained.', MARGIN, top + BOARD + 114);
  look.pieces.forEach((piece, index) => {
    if (piece.owned) return;
    const { garment } = piece;
    const y = top + BOARD + 154 + index * 68;
    context.fillText(`${garment.caption} by ${garment.author} | ${garment.license}`, MARGIN, y, BOARD);
    context.fillText(garment.source, MARGIN, y + 24);
    context.fillText(garment.licenseUrl, MARGIN, y + 48);
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The image could not be created.')), 'image/png'));
}
