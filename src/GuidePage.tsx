import { ArrowRight } from 'lucide-react';
import { guides, guidePath, planEntry, wardrobeEntry, type Guide } from '../shared/guides';
import { garments } from '../shared/outfit-board';
import { Brand } from './ui';
import { PhotoCredits } from './PhotoCredits';
import './LandingPage.css';
import './styles/guides.css';

function NextStep({ wardrobe = false }: { wardrobe?: boolean }) {
  return <section className="guide-next" aria-labelledby="guide-next-title">
    <div><h2 id="guide-next-title" className="section-title">{wardrobe ? 'Try it with your own clothes' : 'Turn your checklist into a plan'}</h2>
      <p>{wardrobe ? 'Create a private wardrobe, add photos of a complete set and confirm the facts. GYF can check the ownership, availability, fit and occasion facts you provide. You decide whether you like the combination.' : 'Create an account, then choose your occasion, weather, dress code and spending ceiling in the planner. It shows general outfit ideas with example garment photos; it does not verify your office policy, fabric or fit.'}</p></div>
    <div className="guide-next-actions">
      <a className="button button-primary" href={wardrobe ? wardrobeEntry.signUp : planEntry.signUp}>{wardrobe ? 'Start my private wardrobe' : 'Create an account to plan'}<ArrowRight size={18} aria-hidden="true" /></a>
      <p className="caption">{wardrobe ? 'Account required. Saving stores your photos on the GetYourFit server. Photo consent is separate.' : 'Account required. You choose your occasion and what to save after you sign in. Photo consent is separate.'}</p>
      <a className="text-link" href={wardrobe ? wardrobeEntry.signIn : planEntry.signIn}>Already have an account? Sign in</a>
    </div>
  </section>;
}

function OfficeGuide() {
  return <>
    <div className="guide-answer prose"><p><strong>Start with the dress code your office actually uses.</strong> Pick a top and bottom, or a one-piece outfit, that you already feel comfortable wearing there. Add shoes you can manage the commute in. Check the whole outfit before leaving, including any layer you need indoors.</p>
      <p>This guide starts with warm-weather office days in India. It covers workplaces that allow smart casual clothing, not uniforms, protective workwear or formal business dress. India has many climates and workplace customs; use your local forecast and employer’s guidance wherever you live.</p></div>
    <nav className="guide-contents" aria-label="In this guide"><span>In this guide</span><a href="#check-the-day">Check the day</a><a href="#choose-a-set">Choose a set</a><a href="#try-it-on">Try it on</a><a href="#use-gyf">Use GYF</a></nav>
    <div className="guide-reading prose">
      <section id="check-the-day"><h2 className="section-title">Check the day before choosing the clothes</h2>
        <ul><li><strong>The workplace:</strong> check any rules about sleeves, footwear, denim or meeting attire. If “smart casual” is unclear, ask for examples of what is accepted.</li>
          <li><strong>The journey:</strong> consider walking, public transport, rain and time outside. A shoe that works at a desk may be uncomfortable on your route.</li>
          <li><strong>The indoor temperature:</strong> decide whether you want a removable layer for air conditioning rather than wearing it throughout a warm commute.</li>
          <li><strong>The clothes available today:</strong> check that they are clean, dry, comfortable and ready to wear. Do not build the plan around something still in the wash.</li></ul>
        <p>For hot conditions, the <a href="https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health">World Health Organization recommends lightweight, loose-fitting clothing</a>. That is heat guidance, not a guarantee about a particular garment. Try the actual piece; a fabric name alone cannot tell you how comfortable it will feel.</p>
      </section>
      <section id="choose-a-set"><h2 className="section-title">Choose one complete set</h2>
        <p>These are starting points to adapt, not dress-code rules. Choose the version that matches your workplace and preferences. There is no required colour palette, gender category or new purchase.</p>
        <div className="guide-table-wrap"><table><caption>Example combinations to check against your own office policy</caption><thead><tr><th scope="col">Starting point</th><th scope="col">Complete it with</th><th scope="col">Check first</th></tr></thead><tbody>
          <tr><th scope="row">A shirt you already wear to work</th><td>Comfortable trousers and workplace-appropriate shoes</td><td>Sleeve rules, movement and the commute</td></tr>
          <tr><th scope="row">A kurta or tunic you like wearing</th><td>Your usual matching bottom and suitable shoes</td><td>Length, coverage and any workplace requirements</td></tr>
          <tr><th scope="row">A one-piece outfit accepted at work</th><td>Shoes you can walk in; an optional indoor layer</td><td>Sitting comfort and whether the layer is needed</td></tr>
        </tbody></table></div>
        <p>A useful swap changes the part that fails the day’s check. If the shoes hurt, try another pair before replacing the whole outfit. If the office needs more coverage, change the relevant piece instead of treating the entire wardrobe as unsuitable.</p>
      </section>
      <section id="try-it-on"><h2 className="section-title">Give the outfit a short real-world check</h2>
        <ol><li>Put on the whole set, including shoes and any layer.</li><li>Sit, reach and walk. Check that you can move comfortably and that fastenings stay secure.</li><li>Look at the outfit in the light you have. Check coverage for your own comfort and your workplace requirements.</li><li>Set aside a backup for rain or an unexpected change of plan.</li></ol>
        <p>You are checking what works for your day, not whether your body fits a fashion rule. If nothing needs replacing, you already have the outfit.</p>
      </section>
      <section id="use-gyf"><h2 className="section-title">What GYF can help with</h2>
        <p>In the planner, enter “Office day”, select the weather and dress code, then set your own spending ceiling and currency. Review the suggestions before choosing a look. The photographs illustrate garment types; they are not products confirmed to be in stock or clothes GYF knows you own.</p>
        <p>For an outfit from your wardrobe, create an account and add your own pieces. You confirm fit, availability and the occasions each piece suits. GYF uses those facts; it does not certify workplace compliance or predict whether a garment will fit.</p>
      </section>
    </div>
    <NextStep />
    <div className="guide-reading prose guide-editorial"><h2 className="card-title">About this guide</h2><p>Written by GetYourFit. Reviewed 23 October 2026. Outfit combinations are editorial suggestions, not findings from a wearer trial. Heat guidance source: <a href="https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health">WHO, Heat and health</a>, checked on the review date. Follow local heat alerts and workplace safety instructions.</p></div>
  </>;
}

function CapsuleGuide() {
  return <>
    <div className="guide-answer prose"><p><strong>Start with the clothes you reach for, then test them as complete outfits.</strong> A capsule is a small rotation that works for your life. It does not need a fixed number of pieces, matching neutrals or a new set of basics.</p><p>This guide uses an everyday week with office and casual plans as an example, including warm-weather days in India. Adapt it to your climate, cultural preferences, access needs and laundry routine. Keep uniforms, specialist clothing and occasion wear when you need them.</p></div>
    <nav className="guide-contents" aria-label="In this guide"><span>In this guide</span><a href="#start-with-a-week">Start with a week</a><a href="#test-combinations">Test combinations</a><a href="#find-a-gap">Find a real gap</a><a href="#keep-a-record">Keep a record</a></nav>
    <div className="guide-reading prose">
      <section id="start-with-a-week"><h2 className="section-title">Start with your next ordinary week</h2>
        <p>Write down where you need to go and what those days ask of your clothes. “Two office days, a day at home and a weekend visit” is more useful than an ideal wardrobe for a life you do not lead.</p>
        <ol><li>Choose a few pieces you already wear and like. Include shoes, not just tops and bottoms.</li><li>Check current fit, condition and availability. Set aside anything that needs repair or does not feel comfortable.</li><li>Consider the time between washes and how long clothes take to dry. Repeating an outfit is fine; relying on a piece that will not be ready is a planning gap.</li><li>Keep the first rotation small enough to try. Add a piece when a real day needs it.</li></ol>
        <p>You do not need to discard the rest of your wardrobe. Keep it available while you learn what this rotation is missing.</p>
      </section>
      <section id="test-combinations"><h2 className="section-title">Test outfits, not just a pile of pieces</h2>
        <p>Put on each combination with its shoes. Check comfort, movement, weather and the actual occasion. Pieces that look compatible on a hanger may not be a combination you enjoy wearing.</p>
        <div className="guide-table-wrap"><table><caption>A sample rotation to adapt using your own clothes</caption><thead><tr><th scope="col">Day</th><th scope="col">Example set</th><th scope="col">What to confirm</th></tr></thead><tbody>
          <tr><th scope="row">Office</th><td>A familiar work top, trousers and work shoes</td><td>Your office policy and commute</td></tr>
          <tr><th scope="row">Casual plans</th><td>A favourite casual top, the same trousers and comfortable shoes</td><td>Whether you like this particular combination</td></tr>
          <tr><th scope="row">Another workday</th><td>A second work top with an available bottom, or a one-piece outfit and shoes</td><td>Laundry timing and the day’s weather</td></tr>
        </tbody></table></div>
        <p>This is an example, not a minimum shopping list. A kurta set, a dress or other clothes you prefer can serve the same day. There is no need to force every top to work with every bottom.</p>
      </section>
    </div>
    <figure className="guide-photo-strip"><div>{garments.filter((item) => ['shirt', 'trousers', 'oxfords'].includes(item.id)).map((item) => <img key={item.id} src={`/example/${item.file}-360.webp`} alt={item.alt} width={item.width} height={item.height} loading="lazy" />)}</div><figcaption>One top, one bottom and shoes: a complete set to check. These real garment photographs are stand-ins, not a prescribed capsule or items added to your wardrobe.</figcaption></figure>
    <div className="guide-reading prose">
      <section id="find-a-gap"><h2 className="section-title">Only add something when you can name the gap</h2>
        <p>After trying the rotation, describe what stopped an outfit working. “I need shoes I can walk to work in” is a concrete need. “My wardrobe needs more basics” does not yet tell you what to change.</p>
        <ul><li><strong>Not ready to wear?</strong> Try cleaning, repair or alteration if it makes sense for the piece.</li><li><strong>Not available that day?</strong> Try a different rotation or laundry timing.</li><li><strong>Missing a role?</strong> Check another item you own or a borrowing option before shopping.</li><li><strong>Simply do not like it together?</strong> Change the combination. You do not have to justify your preference with a style rule.</li></ul>
        <p>If you choose to buy, name the outfits the item should complete and set your own spending limit. Check fit, materials, care and return terms with the seller. A planned budget is not a live price or a promise that a suitable product is available.</p>
      </section>
      <section id="keep-a-record"><h2 className="section-title">Keep a record you can use again</h2>
        <p>Try the rotation through a normal week. Keep a note or photo of combinations you want to repeat, and change those that felt uncomfortable or impractical. That is stronger evidence for your next choice than an arbitrary capsule size.</p>
        <p>GYF’s private wardrobe can hold your garment photos and the facts you confirm. Start with one complete set: top, bottom and footwear, or a one-piece and footwear. Mark what is owned, available and fits now. The current factual checker can ask about missing facts or identify a complete set; it does not learn your taste or automatically track what you wore.</p>
        <p>If you want to explore first, <a href="/sign-up?next=%2Fplan">create an account and open the planner</a>. It uses illustrative garment photos. Selecting and saving a plan is separate from adding the real pieces you own.</p>
      </section>
    </div>
    <NextStep wardrobe />
    <div className="guide-reading prose guide-editorial"><h2 className="card-title">About this guide</h2><p>Written by GetYourFit. Reviewed 23 October 2026. The rotation is an editorial exercise, not a tested promise of savings, sustainability or outfit quality. No recommended item count, paid placement or product endorsement.</p><details><summary>Photograph credits and licences</summary><PhotoCredits items={garments.filter((item) => ['shirt', 'trousers', 'oxfords'].includes(item.id))} /></details></div>
  </>;
}

export default function GuidePage({ guide }: { guide: Guide | null | undefined }) {
  const missing = guide === undefined;
  return <div className="public-page guide-page">
    <a className="skip-link" href="#guide-main">Skip to content</a>
    <header className="public-header"><Brand href="/" /><a className="public-link" href="/sign-in">Sign in<ArrowRight size={16} aria-hidden="true" /></a></header>
    <main id="guide-main">
      <nav className="guide-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span>{guide || missing ? <a href="/guides/">Outfit guides</a> : <span aria-current="page">Outfit guides</span>}</nav>
      <div className="guide-heading"><h1 className="page-title">{guide?.title ?? (missing ? 'This guide could not be found' : 'Make more of the clothes you own')}</h1><p className="lead">{guide?.summary ?? (missing ? 'Choose a guide below or go straight to planning an outfit.' : 'Practical outfit and capsule-wardrobe guides. Start with your day, use what you have, and check the whole outfit.')}</p></div>
      {guide ? <article aria-label={guide.title}>{guide.slug === 'smart-casual-office-outfits' ? <OfficeGuide /> : <CapsuleGuide />}</article> : <div className="guide-index">{guides.map((item) => <section key={item.slug}><h2 className="section-title"><a href={guidePath(item)}>{item.title}<ArrowRight size={22} aria-hidden="true" /></a></h2><p>{item.summary}</p></section>)}<p>These guides use India-first examples without assuming everyone has the same climate, wardrobe or dress code. They offer practical checks, not rules about bodies or personal style.</p><a className="button button-primary" href={planEntry.signUp}>Plan an outfit<ArrowRight size={18} aria-hidden="true" /></a></div>}
      {guide && <aside className="guide-related" aria-labelledby="guide-related-title"><h2 id="guide-related-title" className="section-title">Keep reading</h2>{guides.filter((item) => item.slug !== guide.slug).map((item) => <a key={item.slug} className="text-link" href={guidePath(item)}>{item.title}<ArrowRight size={18} aria-hidden="true" /></a>)}<a className="text-link" href="/guides/">All outfit guides</a></aside>}
    </main>
    <footer className="public-footer"><span>GetYourFit</span><a className="public-link" href="/guides/">Outfit guides</a><a className="public-link" href={planEntry.signUp}>Plan an outfit</a><a className="public-link" href="/sign-in">Back to my wardrobe</a></footer>
  </div>;
}
