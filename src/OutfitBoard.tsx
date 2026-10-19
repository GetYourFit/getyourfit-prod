import { useState } from 'react';
import { CircleCheck, Download } from 'lucide-react';
import { garmentSources, layoutFor, type BoardLook, type OutfitBoard as Board } from '../shared/outfit-board';
import { starterRoleName, type StarterInput } from '../shared/starter-plan';
import { renderBoardImage } from './board-image';
import { Notice } from './ui';
import { PhotoCredits } from './PhotoCredits';

const weatherNames: Record<StarterInput['weather'], string> = { warm: 'Warm', mild: 'Mild', cold: 'Cold', unknown: 'Weather not given' };
const dressCodeNames: Record<StarterInput['dressCode'], string> = { casual: 'Casual', 'smart-casual': 'Smart casual', formal: 'Formal', unknown: 'Dress code not given' };

export function OutfitBoard({ look, heading }: { look: BoardLook; heading: string }) {
  const rects = layoutFor(look.pieces);
  const credits = look.pieces.flatMap((piece) => piece.owned ? [] : [piece.garment]);
  return <div className="board-preview"><figure className="outfit-board" aria-label={`${heading}: ${look.pieces.map((piece) => piece.label).join(', ')}`}>
    {look.pieces.map((piece, index) => {
      const rect = rects[index];
      if (!rect) return null;
      const position = { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` };
      if (piece.owned) {
        return <div className="board-tile board-tile-owned" style={position} key={piece.role}>
          <CircleCheck size={20} aria-hidden="true" />
          <span>Your own {starterRoleName(piece.role).toLowerCase()}</span>
        </div>;
      }
      const { garment } = piece;
      return <div className="board-tile" style={{ ...position, background: garment.backdrop }} key={piece.role}>
        <img {...garmentSources(garment)} sizes="(max-width: 600px) 60vw, 360px" alt={garment.alt} width={garment.width} height={garment.height} />
      </div>;
    })}
  </figure>
    {credits.length > 0 && <details className="disclosure plan-credits"><summary>Photo credits</summary><PhotoCredits items={credits} /></details>}
  </div>;
}

// The board, a switch between the capsule's looks, the pieces in the chosen look, and a download of the board as one image.
export function OutfitBoardPanel({ input, board }: { input: StarterInput; board: Board }) {
  const [lookIndex, setLookIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const look = board.looks[lookIndex] ?? board.looks[0];
  if (!look) return null;

  async function download(current: BoardLook) {
    setBusy(true);
    setError('');
    try {
      const blob = await renderBoardImage(current, input.occasion, `${current.name} · ${weatherNames[input.weather]} · ${dressCodeNames[input.dressCode]}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'getyourfit-outfit.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="board-panel">
    <OutfitBoard look={look} heading={`${look.name} for ${input.occasion}`} />
    <div className="board-panel-side">
      <div className="board-looks" role="group" aria-label="Choose a look">
        {board.looks.map((item, index) => <button key={item.name} type="button" className="chip" aria-pressed={index === lookIndex} onClick={() => setLookIndex(index)}>{item.name}</button>)}
      </div>
      <ul className="board-pieces" aria-label={`Pieces in ${look.name}`}>
        {look.pieces.map((piece) => <li key={piece.role}><span className="board-piece-role">{starterRoleName(piece.role)}</span><span>{piece.owned ? 'You already have this' : piece.garment.caption}</span></li>)}
      </ul>
      <button className="button button-secondary" type="button" onClick={() => void download(look)} disabled={busy}><Download size={18} aria-hidden="true" />{busy ? 'Making image…' : 'Download as image'}</button>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
    </div>
  </div>;
}
