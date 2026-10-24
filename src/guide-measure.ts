import { countStep } from './funnel';

countStep('guide_viewed');
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('a[data-guide-cta]')) countStep('guide_cta_clicked');
});
