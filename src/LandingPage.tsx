import './zod-config';
import { ArrowDown, ArrowRight, LockKeyhole } from 'lucide-react';
import { buildStarterRoles, starterInputSchema } from '../shared/starter-plan';
import { composeBoard } from '../shared/outfit-board';
import { OutfitBoard } from './OutfitBoard';
import { Brand } from './ui';
import './LandingPage.css';

const exampleInput = starterInputSchema.parse({ occasion: 'Dinner with friends', outfitType: 'separates', budget: 5000, currency: 'INR', weather: 'mild', dressCode: 'casual', mustHave: '', ownedRoles: [] });
const exampleBoard = composeBoard(exampleInput, buildStarterRoles(exampleInput, '2026-01-01T00:00:00.000Z'));

export function LandingPage() {
  const look = exampleBoard.looks[0];
  return <div className="public-page landing-page">
    <a className="skip-link" href="#public-main">Skip to content</a>
    <header className="public-header">
      <Brand href="/" />
      <nav aria-label="Main"><a className="public-link public-about" href="#how-it-works">How it works</a><a className="public-link" href="/sign-in">Sign in<ArrowRight size={18} aria-hidden="true" /></a></nav>
    </header>
    <main id="public-main">
      <section className="dressing-room" aria-labelledby="public-title">
        <div className="dressing-copy">
          <h1 id="public-title">Less wondering.<br /><span>More wearing.</span></h1>
          <p className="dressing-lead">Decide what to wear with what you own.<br />Or make a plan for the pieces you need.</p>
          <div className="dressing-actions">
            <a className="button button-primary button-split" href="/sign-up">Use my own clothes<ArrowRight size={20} aria-hidden="true" /></a>
            <a className="button button-secondary button-split" href="/sign-up?next=%2Fplan">Build my wardrobe<ArrowRight size={20} aria-hidden="true" /></a>
          </div>
          <p className="dressing-note">Sign in or create an account to plan and use your wardrobe.</p>
          <a className="dressing-scroll" href="#how-it-works">A little less effort, every morning<ArrowDown size={18} aria-hidden="true" /></a>
        </div>
        <section className="dressing-example" aria-labelledby="example-title">
          <div className="dressing-example-heading"><h2 id="example-title">Example outfit</h2><span>Dinner with friends · Mild weather · Casual</span></div>
          {look && <OutfitBoard look={look} heading="Illustrative example outfit" />}
          <p className="caption">Static marketing illustration: {look?.pieces.map((piece) => piece.owned ? piece.label : piece.garment.caption).join(' + ')}.</p>
          <div className="example-reason"><h3>Why this works</h3><p>A top, a bottom and shoes cover the complete set. These example pieces illustrate casual plans in mild weather.</p></div>
          <p className="caption">Illustrative plan with real stand-in photos. Fit and availability are unverified. Your private wardrobe starts empty.</p>
        </section>
      </section>
      <section className="wearer-path" id="how-it-works" aria-labelledby="path-title">
        <div className="wearer-path-intro"><h2 id="path-title">Start with your clothes.<br />End with a decision.</h2><p>No need to catalogue your whole life. Start with a top, a bottom and shoes, or a one-piece and shoes.</p></div>
        <ol className="wearer-steps">
          <li><h3>Make it yours</h3><p>Add real garment photos. Review recognition suggestions and confirm the details only you know.</p></li>
          <li><h3>Dress for your day</h3><p>Choose an occasion, weather and dress code. Check a complete outfit against your confirmed garment facts.</p></li>
          <li><h3>Keep the useful parts</h3><p>Correct an item, exclude it for an occasion, or save a wardrobe plan. Come back to what you kept.</p></li>
        </ol>
      </section>
      <section className="public-privacy" aria-labelledby="public-privacy-title">
        <LockKeyhole size={28} aria-hidden="true" />
        <div><h2 id="public-privacy-title">Your wardrobe stays private.</h2><p>Recognition runs on your device. Only saving sends a photo to your private account on the GetYourFit server. Photos are never sold or used for model training. Download or delete your data from Account.</p></div>
        <a className="button button-secondary" href="/sign-up">Start my wardrobe<ArrowRight size={18} aria-hidden="true" /></a>
      </section>
    </main>
    <footer className="public-footer"><Brand href="/" /><p>Wear what works for you.</p><a className="public-link" href="/sign-in">Back to my wardrobe<ArrowRight size={16} aria-hidden="true" /></a></footer>
  </div>;
}
