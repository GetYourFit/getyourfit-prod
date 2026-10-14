import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import './LandingPage.css';

export function LandingPage() {
  return <div className="public-page">
    <a className="skip-link" href="#public-main">Skip to content</a>
    <header className="public-header">
      <a className="public-brand" href="/" aria-label="GetYourFit home"><span className="public-mark" aria-hidden="true">g.</span>GetYourFit</a>
      <a className="public-link" href="/sign-in">Sign in<ArrowRight size={16} aria-hidden="true" /></a>
    </header>
    <main id="public-main">
      <div className="public-intro">
        <h1>Your clothes.<br />One clear outfit.</h1>
        <p>Add your clothes. Tell us your plans.<br className="desktop-break" /> Get a complete outfit, with the reasons.</p>
      </div>
      <section className="example-outfit" aria-labelledby="example-title">
        <div className="example-heading"><h2 id="example-title">Example outfit</h2><p>Dinner with friends · Mild weather · Casual</p></div>
        <div className="example-layout">
          <div className="outfit-photographs" aria-label="A complete example: top, trousers and footwear">
            <figure className="example-piece example-shirt"><img src="/example/shirt.webp" srcSet="/example/shirt-360.webp 360w, /example/shirt-600.webp 600w, /example/shirt.webp 900w" sizes="(max-width: 600px) 50vw, (max-width: 1000px) 48vw, 32vw" alt="Checked cotton shirt from The Met collection" width={900} height={824} fetchPriority="high" /><figcaption>Checked cotton shirt</figcaption></figure>
            <figure className="example-piece example-trousers"><img src="/example/trousers.webp" srcSet="/example/trousers-360.webp 360w, /example/trousers-600.webp 600w, /example/trousers.webp 646w" sizes="(max-width: 600px) 36vw, (max-width: 1000px) 35vw, 23vw" alt="Cream cotton trousers from The Met collection" width={646} height={1200} /><figcaption>Cotton trousers</figcaption></figure>
            <figure className="example-piece example-shoes"><img src="/example/oxfords.webp" srcSet="/example/oxfords-360.webp 360w, /example/oxfords-600.webp 600w, /example/oxfords.webp 728w" sizes="(max-width: 600px) 50vw, (max-width: 1000px) 48vw, 32vw" alt="Brown leather lace-up shoes from The Met collection" width={728} height={516} /><figcaption>Leather lace-ups</figcaption></figure>
          </div>
          <div className="example-reasons">
            <h3>Why this works</h3>
            <p className="example-explanation">A complete set, marked for mild weather and casual plans.</p>
            <a className="public-primary" href="/sign-up">Build my wardrobe<ArrowRight size={18} aria-hidden="true" /></a>
            <p className="public-start-note">Start with one photo. Add a complete set when you're ready.</p>
            <details className="example-details"><summary>About this example</summary><ul>
              <li><Check size={18} aria-hidden="true" /><span>A top, bottom and footwear. Nothing missing.</span></li>
              <li><Check size={18} aria-hidden="true" /><span>Each piece is marked for mild weather and casual plans.</span></li>
              <li><Check size={18} aria-hidden="true" /><span>Fit and availability are confirmed by the wearer.</span></li>
            </ul>
            <p className="example-disclosure">These are illustrative facts, shown with historical collection photographs. Your outfits use only clothes you add. You confirm fit; we don't predict it.</p>
            </details><p className="example-label">Example facts and collection photos. Your wardrobe starts empty.</p>
          </div>
        </div>
      </section>
      <section className="public-privacy" aria-labelledby="public-privacy-title">
        <LockKeyhole size={24} aria-hidden="true" />
        <div><h2 id="public-privacy-title">Your wardrobe stays private.</h2><p>Your photos go to the GetYourFit server that holds your account, where they are reviewed without an external AI service. They are never sold or used for model training. You can download or delete your data.</p></div>
      </section>
    </main>
    <footer className="public-footer"><span>GetYourFit</span><details><summary>Example photo credits</summary><p>Real garment photographs from The Metropolitan Museum of Art, shared under <a href="https://www.metmuseum.org/hubs/open-access">CC0 Open Access</a>: <a href="https://www.metmuseum.org/art/collection/search/91159">shirt</a>, <a href="https://www.metmuseum.org/art/collection/search/91001">trousers</a>, and <a href="https://www.metmuseum.org/art/collection/search/90428">lace-ups</a>. <a href="/example/provenance.json">Source records and image provenance</a>.</p></details></footer>
  </div>;
}
