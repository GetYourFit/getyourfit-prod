// a7eaf22f474369d1aa0e94934ccb1c88eb757821
// UI quality gate: accessibility, design-system rules, and visual regression for the main screens at each supported width.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const fixture = name => new URL(`../fixtures/${name}`, import.meta.url).pathname;
const widths = [390, 768, 1440];
// Baselines are rendered in CI's pinned Linux image. Other platforms render text differently, so they compare only on request.
const compareScreenshots = process.platform === 'linux' || process.env.UI_VISUAL === '1';
const password = `ui-quality-${randomUUID()}`;
const wardrobe = [['top.jpg', {
  name: 'Grey crew tee',
  category: 'top',
  color: 'grey',
  size: 'M'
}], ['bottom.jpg', {
  name: 'Olive cargo trousers',
  category: 'bottom',
  color: 'olive',
  size: '32'
}], ['footwear.jpg', {
  name: 'Black trainers',
  category: 'footwear',
  color: 'black',
  size: '9'
}]];

// Measures the documented design-system rules on rendered, visible content.
function measureDesign() {
  const visible = element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const text = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !node.textContent.trim() || parent.closest('script, style, option, [aria-hidden="true"]') || !visible(parent)) continue;
    const style = getComputedStyle(parent);
    text.push({
      text: node.textContent.trim().slice(0, 40),
      size: parseFloat(style.fontSize),
      family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim()
    });
  }
  const inlineLink = element => element.matches('a') && element.closest('p, li') && element.closest('p, li').textContent.trim() !== element.textContent.trim();
  const targets = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')].filter(element => visible(element) && !inlineLink(element) && !element.closest('[inert]')).map(element => {
    const box = (element.matches('input[type=checkbox], input[type=radio]') ? element.closest('label') ?? element : element).getBoundingClientRect();
    return {
      name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || element.tagName).trim().slice(0, 40),
      height: Math.round(box.height),
      width: Math.round(box.width)
    };
  });
  return {
    smallText: text.filter(entry => entry.size < 14),
    otherFamilies: [...new Set(text.map(entry => entry.family).filter(family => family !== 'Manrope'))],
    h1: document.querySelectorAll('h1').length,
    smallTargets: targets.filter(target => target.height < 44 || target.width < 24),
    overflow: document.documentElement.scrollWidth > window.innerWidth
  };
}
async function checkScreen(page, name, {
  fullPage = true
} = {}) {
  for (const width of widths) {
    await test.step(`${name} at ${width}px`, async () => {
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : width === 768 ? 1024 : 900
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      const design = await page.evaluate(measureDesign);
      expect.soft(design.smallText, 'Visible text is at least 14px').toEqual([]);
      expect.soft(design.otherFamilies, 'Visible text uses only Manrope').toEqual([]);
      expect.soft(design.h1, 'The screen has exactly one h1').toBe(1);
      expect.soft(design.smallTargets, 'Interactive targets are at least 44px tall').toEqual([]);
      expect.soft(design.overflow, 'No horizontal overflow').toBe(false);
      await page.evaluate(axeSource);
      const violations = await page.evaluate(async () => (await window.axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
        }
      })).violations.map(({
        id,
        nodes
      }) => ({
        id,
        targets: nodes.map(node => node.target.join(' '))
      })));
      expect.soft(violations, 'axe WCAG 2.2 AA violations').toEqual([]);
      if (compareScreenshots && fullPage) await page.evaluate(() => window.scrollTo(0, 0));
      if (compareScreenshots) await expect.soft(page).toHaveScreenshot(`${name}-${width}.png`, {
        fullPage
      });
    });
  }
}
async function api(page, method, url, body) {
  return page.evaluate(async ([verb, path, data]) => {
    const response = await fetch(path, {
      method: verb,
      credentials: 'same-origin',
      headers: data ? {
        'Content-Type': 'application/json'
      } : {},
      body: data ? JSON.stringify(data) : undefined
    });
    return {
      status: response.status,
      body: await response.json().catch(() => null)
    };
  }, [method, url, body]);
}

// The server allows five sign-ups a minute across the whole run, so a refused sign-up waits out the window rather than weakening the limit.
async function signUp(page, email) {
  await page.goto('/sign-in');
  for (let attempt = 0;; attempt += 1) {
    const response = await api(page, 'POST', '/api/auth/sign-up/email', {
      name: 'Quality check',
      email,
      password,
      adultConfirmed: true,
      callbackURL: new URL(page.url()).origin
    });
    if (response.status === 429 && attempt < 2) {
      test.setTimeout(test.info().timeout + 65_000);
      await page.waitForTimeout(61_000);
      continue;
    }
    expect(response.status).toBe(200);
    return;
  }
}
async function addWardrobe(page, {
  uncertainFit = false
} = {}) {
  for (const [file, facts] of wardrobe) {
    const image = (await sharp(fixture(file)).resize(1200, 1200, {
      fit: 'inside'
    }).jpeg({
      quality: 85
    }).toBuffer()).toString('base64');
    const response = await api(page, 'POST', '/api/wardrobe', {
      consent: true,
      image,
      facts: {
        ...facts,
        fit: uncertainFit && facts.category === 'top' ? 'unknown' : 'fits',
        owned: true,
        available: true,
        weather: ['mild'],
        dressCode: ['casual', 'smart-casual']
      }
    });
    expect(response.status).toBe(201);
  }
}
test.beforeEach(async ({
  page
}) => {
  // The font uses font-display: optional, so load it into the cache before the first measured render.
  await page.goto('/');
  await page.evaluate(() => document.fonts.load('16px Manrope'));
});
test('public page', async ({
  page
}) => {
  await page.goto('/');
  await checkScreen(page, 'public');
});
test('account entry', async ({
  page
}) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Sign in'
  })).toBeVisible();
  await checkScreen(page, 'sign-in');
  await page.getByRole('button', {
    name: 'Create an account'
  }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByLabel('Your name')).toBeFocused();
  await checkScreen(page, 'sign-up');
  await page.getByLabel('Your name').fill('Quality check');
  await page.getByLabel('Email').fill('entry@example.test');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', {
    name: 'Create account'
  }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('18 or older');
  await expect(alert).toBeFocused();
  await expect(page.getByRole('checkbox', {
    name: /18 or older/
  })).toHaveAttribute('aria-invalid', 'true');
  await checkScreen(page, 'sign-up-error');
});
test('empty wardrobe and garment upload', async ({
  page
}) => {
  await signUp(page, 'upload@example.test');
  await page.goto('/wardrobe');
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Your wardrobe'
  })).toBeFocused();
  await checkScreen(page, 'wardrobe-empty');
  const add = page.locator('#add-garment');
  await add.click();
  const dialog = page.getByRole('dialog', {
    name: 'Add a garment'
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox', {
    name: /permission to use its photo/
  })).toBeFocused();
  await expect(dialog.getByLabel('Garment photo')).toBeDisabled();
  await checkScreen(page, 'garment-dialog', {
    fullPage: false
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
  await add.click();
  await dialog.getByRole('checkbox', {
    name: /permission to use its photo/
  }).check();
  await page.route('https://huggingface.co/**', route => route.abort('internetdisconnected'));
  await dialog.getByLabel('Garment photo').setInputFiles(fixture('top.jpg'));
  await expect(dialog.getByText('Choose a different photo')).toBeVisible({
    timeout: 30_000
  });
  await expect(dialog.getByLabel('Name', {
    exact: true
  })).toBeFocused();
  await expect(dialog.getByText(/Image classification is unavailable on this device or connection/)).toBeVisible();
  await checkScreen(page, 'garment-dialog-reviewed', {
    fullPage: false
  });
});
test('wardrobe, outfit suggestion and account', async ({
  page
}) => {
  await signUp(page, 'outfit@example.test');
  await addWardrobe(page);
  await page.goto('/wardrobe');
  await expect(page.getByRole('img', {
    name: 'Black trainers'
  })).toBeVisible();
  await checkScreen(page, 'wardrobe-filled');
  const occasion = page.getByLabel('Occasion', {
    exact: true
  });
  await occasion.fill('Dinner with friends');
  await page.getByRole('button', {
    name: 'Find an outfit'
  }).click();
  await expect(page.getByText('What weather should this outfit work for?')).toBeFocused();
  await checkScreen(page, 'outfit-question');
  await page.getByLabel('Weather', {
    exact: true
  }).selectOption('mild');
  await page.getByLabel('Dress code', {
    exact: true
  }).selectOption('casual');
  await page.getByRole('button', {
    name: 'Find an outfit'
  }).click();
  const result = page.getByRole('heading', {
    name: 'Your outfit for Dinner with friends'
  });
  await expect(result).toBeFocused();
  await checkScreen(page, 'outfit-result');
  await page.getByRole('link', {
    name: 'Account'
  }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Account'
  })).toBeFocused();
  await checkScreen(page, 'account');
});
test('concurrent wardrobe refreshes and edits preserve confirmed facts', async ({
  page
}) => {
  await signUp(page, `concurrent-${randomUUID()}@example.test`);
  for (const action of ['edit', 'remove']) {
    await test.step(action, async () => {
      const previous = await api(page, 'GET', '/api/wardrobe');
      expect(previous.status).toBe(200);
      for (const item of previous.body) expect((await api(page, 'DELETE', `/api/wardrobe/${item.id}`)).status).toBe(200);
      await addWardrobe(page, {
        uncertainFit: true
      });
      await page.goto('/wardrobe');
      await page.getByLabel('Occasion', {
        exact: true
      }).fill('Dinner');
      await page.getByLabel('Weather', {
        exact: true
      }).selectOption('mild');
      await page.getByLabel('Dress code', {
        exact: true
      }).selectOption('casual');
      await page.getByRole('button', {
        name: 'Find an outfit'
      }).click();
      await expect(page.getByRole('button', {
        name: 'Yes, it fits',
        exact: true
      })).toBeVisible();
      const held = Promise.withResolvers();
      const captured = Promise.withResolvers();
      const delivered = Promise.withResolvers();
      await page.route('**/api/wardrobe', async route => {
        const response = await route.fetch();
        captured.resolve();
        await held.promise;
        await route.fulfill({
          response
        });
        delivered.resolve();
      }, {
        times: 1
      });
      try {
        await page.getByRole('button', {
          name: 'Yes, it fits',
          exact: true
        }).click();
        await captured.promise;
        if (action === 'edit') {
          await page.getByRole('button', {
            name: 'Edit Grey crew tee',
            exact: true
          }).click();
          const dialog = page.getByRole('dialog', {
            name: 'Edit Grey crew tee',
            exact: true
          });
          await dialog.getByLabel('Name', {
            exact: true
          }).fill('Renamed tee');
          await dialog.getByRole('button', {
            name: 'Save changes'
          }).click();
          await expect(dialog).toBeHidden();
          await page.getByRole('button', {
            name: 'Edit Renamed tee',
            exact: true
          }).click();
          const unchanged = page.getByRole('dialog', {
            name: 'Edit Renamed tee',
            exact: true
          });
          const patches = [];
          const recordPatch = request => {
            if (request.method() === 'PATCH') patches.push(request.url());
          };
          page.on('request', recordPatch);
          try {
            await unchanged.getByRole('button', {
              name: 'Save changes'
            }).click();
            await expect(unchanged).toBeHidden();
            expect.soft(patches).toEqual([]);
          } finally {
            page.off('request', recordPatch);
          }
        } else {
          await page.getByRole('button', {
            name: 'Remove Black trainers',
            exact: true
          }).click();
          await page.getByRole('button', {
            name: 'Yes, remove',
            exact: true
          }).click();
          await expect(page.getByRole('heading', {
            name: 'Black trainers',
            exact: true
          })).toHaveCount(0);
        }
        held.resolve();
        await delivered.promise;
        await expect(page.getByRole('button', {
          name: 'Find an outfit'
        })).toBeEnabled({
          timeout: 20_000
        });
        const current = await api(page, 'GET', '/api/wardrobe');
        expect(current.status).toBe(200);
        if (action === 'edit') {
          const top = current.body.find(item => item.facts.category === 'top');
          expect.soft(top.facts.name).toBe('Renamed tee');
          expect.soft(top.facts.fit).toBe('fits');
          await expect.soft(page.getByRole('article', {
            name: 'Renamed tee'
          })).toBeVisible();
        } else {
          expect(current.body.some(item => item.facts.category === 'footwear')).toBe(false);
          await expect.soft(page.getByRole('heading', {
            name: 'Black trainers',
            exact: true
          })).toHaveCount(0);
        }
      } finally {
        held.resolve();
      }
    });
  }
});
test('plan page', async ({
  page
}) => {
  await page.goto('/plan');
  await expect(page.getByRole('heading', {
    level: 1
  })).toHaveText('See your outfit in a minute.');
  await checkScreen(page, 'plan-empty');
});
test('visitor gets an outfit board without an account, then saves it after sign-up', async ({
  page
}) => {
  const hosts = new Set();
  const steps = [];
  page.on('request', request => {
    hosts.add(new URL(request.url()).host);
    if (request.url().endsWith('/api/funnel')) steps.push(request.postDataJSON().event);
  });
  await page.goto('/');
  await page.getByRole('link', {
    name: 'Plan an outfit now'
  }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByLabel('What is the occasion?').fill('Dinner with friends');
  await page.getByRole('radio', {
    name: 'Cold'
  }).check();
  await page.getByRole('button', {
    name: 'Show my outfit'
  }).click();
  const heading = page.getByRole('heading', {
    name: 'Your outfit for Dinner with friends'
  });
  await expect(heading).toBeFocused();
  const board = page.getByRole('figure');
  await expect(board.getByRole('img')).toHaveCount(3);
  await expect.poll(() => board.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(page.getByRole('heading', {
    name: 'Why this works'
  })).toBeVisible();
  await expect(page.getByText('For cold weather')).toBeVisible();
  const alts = () => board.locator('img').evaluateAll(images => images.map(image => image.alt));
  const first = await alts();
  await page.getByRole('button', {
    name: 'Look 2'
  }).click();
  await expect(page.getByRole('button', {
    name: 'Look 2'
  })).toHaveAttribute('aria-pressed', 'true');
  expect(await alts()).not.toEqual(first);
  await page.getByRole('button', {
    name: 'Look 1'
  }).click();
  expect(await alts()).toEqual(first);
  await checkScreen(page, 'plan-result');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {
    name: 'Download as image'
  }).click();
  expect((await downloading).suggestedFilename()).toBe('getyourfit-outfit.png');
  await page.getByRole('button', {
    name: 'Save this outfit'
  }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await page.getByLabel('Your name').fill('Visitor');
  await page.getByLabel('Email', {
    exact: true
  }).fill(`visitor-${randomUUID()}@example.test`);
  await page.getByLabel('Password', {
    exact: true
  }).fill(password);
  await page.getByRole('checkbox', {
    name: /18 or older/
  }).check();
  await page.getByRole('button', {
    name: 'Create account',
    exact: true
  }).click();
  if (await page.getByRole('alert').first().isVisible({
    timeout: 1500
  }).catch(() => false)) {
    test.setTimeout(test.info().timeout + 65_000);
    await page.waitForTimeout(61_000);
    await page.getByRole('button', {
      name: 'Create account',
      exact: true
    }).click();
  }
  const builder = page.locator('#build-plan');
  await expect(builder.getByRole('heading', {
    name: 'Needs for Dinner with friends'
  })).toBeVisible();
  await builder.getByRole('button', {
    name: 'Save plan'
  }).click();
  await expect(builder.getByRole('status').filter({
    hasText: 'Plan saved'
  })).toBeVisible();
  await expect.poll(() => steps.includes('plan_saved_after_visit')).toBe(true);
  expect(steps).toEqual(['plan_opened', 'plan_submitted', 'outfit_shown', 'save_prompt_shown', 'save_prompt_accepted', 'plan_saved_after_visit']);
  expect([...hosts]).toEqual([new URL(page.url()).host]);
});
test('starter plan with shopping links', async ({
  page
}) => {
  await signUp(page, 'plan@example.test');
  await page.goto('/wardrobe');
  const builder = page.locator('#build-plan');
  await builder.getByLabel('What is the occasion?').fill('College days');
  await builder.getByLabel('Spending ceiling').fill('3000');
  await builder.getByLabel('Plan weather').selectOption('warm');
  await builder.getByLabel('Plan dress code').selectOption('casual');
  await builder.getByLabel('I already have suitable footwear').check();
  await builder.getByRole('button', {
    name: 'Make my starter plan'
  }).click();
  await expect(builder.getByRole('heading', {
    name: 'Needs for College days'
  })).toBeFocused();
  const shop = builder.getByRole('region', {
    name: 'Where to shop for this outfit'
  });
  await shop.getByRole('radio', {
    name: 'Men’s',
    exact: true
  }).check();
  await expect(shop.getByRole('link', {
    name: /Affiliate link/
  }).first()).toBeVisible();
  await checkScreen(page, 'starter-plan-shopping');
});
test('design gates reject known defects', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.insertAdjacentHTML('beforeend', '<h1>Second title</h1><p style="font-size:12px">Tiny caption</p><p style="font-family:Georgia">Serif copy</p><button style="min-height:0;height:30px;padding:0 8px">Small</button><div style="width:3000px;height:1px"></div><p style="color:#9aa39e">Faint text</p>');
  });
  const design = await page.evaluate(measureDesign);
  expect(design.smallText.map(entry => entry.text)).toContain('Tiny caption');
  expect(design.otherFamilies).toContain('Georgia');
  expect(design.h1).toBe(2);
  expect(design.smallTargets.map(target => target.name)).toContain('Small');
  expect(design.overflow).toBe(true);
  await page.evaluate(axeSource);
  const ids = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2aa']
    }
  })).violations.map(({
    id
  }) => id));
  expect(ids).toContain('color-contrast');
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyYW5kb21VVUlEIiwicmVhZEZpbGUiLCJjcmVhdGVSZXF1aXJlIiwiZXhwZWN0IiwidGVzdCIsInNoYXJwIiwiYXhlU291cmNlIiwiaW1wb3J0IiwibWV0YSIsInVybCIsInJlc29sdmUiLCJmaXh0dXJlIiwibmFtZSIsIlVSTCIsInBhdGhuYW1lIiwid2lkdGhzIiwiY29tcGFyZVNjcmVlbnNob3RzIiwicHJvY2VzcyIsInBsYXRmb3JtIiwiZW52IiwiVUlfVklTVUFMIiwicGFzc3dvcmQiLCJ3YXJkcm9iZSIsImNhdGVnb3J5IiwiY29sb3IiLCJzaXplIiwibWVhc3VyZURlc2lnbiIsInZpc2libGUiLCJlbGVtZW50IiwiYm94IiwiZ2V0Qm91bmRpbmdDbGllbnRSZWN0Iiwic3R5bGUiLCJnZXRDb21wdXRlZFN0eWxlIiwid2lkdGgiLCJoZWlnaHQiLCJ2aXNpYmlsaXR5IiwiZGlzcGxheSIsInRleHQiLCJ3YWxrZXIiLCJkb2N1bWVudCIsImNyZWF0ZVRyZWVXYWxrZXIiLCJib2R5IiwiTm9kZUZpbHRlciIsIlNIT1dfVEVYVCIsIm5leHROb2RlIiwibm9kZSIsImN1cnJlbnROb2RlIiwicGFyZW50IiwicGFyZW50RWxlbWVudCIsInRleHRDb250ZW50IiwidHJpbSIsImNsb3Nlc3QiLCJwdXNoIiwic2xpY2UiLCJwYXJzZUZsb2F0IiwiZm9udFNpemUiLCJmYW1pbHkiLCJmb250RmFtaWx5Iiwic3BsaXQiLCJyZXBsYWNlIiwiaW5saW5lTGluayIsIm1hdGNoZXMiLCJ0YXJnZXRzIiwicXVlcnlTZWxlY3RvckFsbCIsImZpbHRlciIsIm1hcCIsImdldEF0dHJpYnV0ZSIsInRhZ05hbWUiLCJNYXRoIiwicm91bmQiLCJzbWFsbFRleHQiLCJlbnRyeSIsIm90aGVyRmFtaWxpZXMiLCJTZXQiLCJoMSIsImxlbmd0aCIsInNtYWxsVGFyZ2V0cyIsInRhcmdldCIsIm92ZXJmbG93IiwiZG9jdW1lbnRFbGVtZW50Iiwic2Nyb2xsV2lkdGgiLCJ3aW5kb3ciLCJpbm5lcldpZHRoIiwiY2hlY2tTY3JlZW4iLCJwYWdlIiwiZnVsbFBhZ2UiLCJzdGVwIiwic2V0Vmlld3BvcnRTaXplIiwiZXZhbHVhdGUiLCJmb250cyIsInJlYWR5IiwiUHJvbWlzZSIsImFsbCIsImltYWdlcyIsImltYWdlIiwiZGVjb2RlIiwiY2F0Y2giLCJkZXNpZ24iLCJzb2Z0IiwidG9FcXVhbCIsInRvQmUiLCJ2aW9sYXRpb25zIiwiYXhlIiwicnVuIiwicnVuT25seSIsInR5cGUiLCJ2YWx1ZXMiLCJpZCIsIm5vZGVzIiwiam9pbiIsInNjcm9sbFRvIiwidG9IYXZlU2NyZWVuc2hvdCIsImFwaSIsIm1ldGhvZCIsInZlcmIiLCJwYXRoIiwiZGF0YSIsInJlc3BvbnNlIiwiZmV0Y2giLCJjcmVkZW50aWFscyIsImhlYWRlcnMiLCJKU09OIiwic3RyaW5naWZ5IiwidW5kZWZpbmVkIiwic3RhdHVzIiwianNvbiIsInNpZ25VcCIsImVtYWlsIiwiZ290byIsImF0dGVtcHQiLCJhZHVsdENvbmZpcm1lZCIsImNhbGxiYWNrVVJMIiwib3JpZ2luIiwic2V0VGltZW91dCIsImluZm8iLCJ0aW1lb3V0Iiwid2FpdEZvclRpbWVvdXQiLCJhZGRXYXJkcm9iZSIsInVuY2VydGFpbkZpdCIsImZpbGUiLCJmYWN0cyIsInJlc2l6ZSIsImZpdCIsImpwZWciLCJxdWFsaXR5IiwidG9CdWZmZXIiLCJ0b1N0cmluZyIsImNvbnNlbnQiLCJvd25lZCIsImF2YWlsYWJsZSIsIndlYXRoZXIiLCJkcmVzc0NvZGUiLCJiZWZvcmVFYWNoIiwibG9hZCIsImdldEJ5Um9sZSIsImxldmVsIiwidG9CZVZpc2libGUiLCJjbGljayIsInRvSGF2ZVVSTCIsImdldEJ5TGFiZWwiLCJ0b0JlRm9jdXNlZCIsImZpbGwiLCJhbGVydCIsInRvQ29udGFpblRleHQiLCJ0b0hhdmVBdHRyaWJ1dGUiLCJhZGQiLCJsb2NhdG9yIiwiZGlhbG9nIiwidG9CZURpc2FibGVkIiwia2V5Ym9hcmQiLCJwcmVzcyIsInRvQmVIaWRkZW4iLCJjaGVjayIsInJvdXRlIiwiYWJvcnQiLCJzZXRJbnB1dEZpbGVzIiwiZ2V0QnlUZXh0IiwiZXhhY3QiLCJvY2Nhc2lvbiIsInNlbGVjdE9wdGlvbiIsInJlc3VsdCIsImFjdGlvbiIsInByZXZpb3VzIiwiaXRlbSIsImhlbGQiLCJ3aXRoUmVzb2x2ZXJzIiwiY2FwdHVyZWQiLCJkZWxpdmVyZWQiLCJwcm9taXNlIiwiZnVsZmlsbCIsInRpbWVzIiwidW5jaGFuZ2VkIiwicGF0Y2hlcyIsInJlY29yZFBhdGNoIiwicmVxdWVzdCIsIm9uIiwib2ZmIiwidG9IYXZlQ291bnQiLCJ0b0JlRW5hYmxlZCIsImN1cnJlbnQiLCJ0b3AiLCJmaW5kIiwic29tZSIsInRvSGF2ZVRleHQiLCJob3N0cyIsInN0ZXBzIiwiaG9zdCIsImVuZHNXaXRoIiwicG9zdERhdGFKU09OIiwiZXZlbnQiLCJoZWFkaW5nIiwiYm9hcmQiLCJwb2xsIiwiZXZhbHVhdGVBbGwiLCJldmVyeSIsImNvbXBsZXRlIiwibmF0dXJhbFdpZHRoIiwiYWx0cyIsImFsdCIsImZpcnN0Iiwibm90IiwiZG93bmxvYWRpbmciLCJ3YWl0Rm9yRXZlbnQiLCJzdWdnZXN0ZWRGaWxlbmFtZSIsImlzVmlzaWJsZSIsImJ1aWxkZXIiLCJoYXNUZXh0IiwiaW5jbHVkZXMiLCJzaG9wIiwibWFpbiIsInF1ZXJ5U2VsZWN0b3IiLCJpbnNlcnRBZGphY2VudEhUTUwiLCJ0b0NvbnRhaW4iLCJpZHMiXSwic291cmNlcyI6WyJxdWFsaXR5LnNwZWMubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFVJIHF1YWxpdHkgZ2F0ZTogYWNjZXNzaWJpbGl0eSwgZGVzaWduLXN5c3RlbSBydWxlcywgYW5kIHZpc3VhbCByZWdyZXNzaW9uIGZvciB0aGUgbWFpbiBzY3JlZW5zIGF0IGVhY2ggc3VwcG9ydGVkIHdpZHRoLlxuaW1wb3J0IHsgcmFuZG9tVVVJRCB9IGZyb20gJ25vZGU6Y3J5cHRvJztcbmltcG9ydCB7IHJlYWRGaWxlIH0gZnJvbSAnbm9kZTpmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbm9kZTptb2R1bGUnO1xuaW1wb3J0IHsgZXhwZWN0LCB0ZXN0IH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCc7XG5pbXBvcnQgc2hhcnAgZnJvbSAnc2hhcnAnO1xuXG5jb25zdCBheGVTb3VyY2UgPSBhd2FpdCByZWFkRmlsZShjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCkucmVzb2x2ZSgnYXhlLWNvcmUvYXhlLm1pbi5qcycpLCAndXRmOCcpO1xuY29uc3QgZml4dHVyZSA9IChuYW1lKSA9PiBuZXcgVVJMKGAuLi9maXh0dXJlcy8ke25hbWV9YCwgaW1wb3J0Lm1ldGEudXJsKS5wYXRobmFtZTtcbmNvbnN0IHdpZHRocyA9IFszOTAsIDc2OCwgMTQ0MF07XG4vLyBCYXNlbGluZXMgYXJlIHJlbmRlcmVkIGluIENJJ3MgcGlubmVkIExpbnV4IGltYWdlLiBPdGhlciBwbGF0Zm9ybXMgcmVuZGVyIHRleHQgZGlmZmVyZW50bHksIHNvIHRoZXkgY29tcGFyZSBvbmx5IG9uIHJlcXVlc3QuXG5jb25zdCBjb21wYXJlU2NyZWVuc2hvdHMgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnbGludXgnIHx8IHByb2Nlc3MuZW52LlVJX1ZJU1VBTCA9PT0gJzEnO1xuY29uc3QgcGFzc3dvcmQgPSBgdWktcXVhbGl0eS0ke3JhbmRvbVVVSUQoKX1gO1xuY29uc3Qgd2FyZHJvYmUgPSBbXG4gIFsndG9wLmpwZycsIHsgbmFtZTogJ0dyZXkgY3JldyB0ZWUnLCBjYXRlZ29yeTogJ3RvcCcsIGNvbG9yOiAnZ3JleScsIHNpemU6ICdNJyB9XSxcbiAgWydib3R0b20uanBnJywgeyBuYW1lOiAnT2xpdmUgY2FyZ28gdHJvdXNlcnMnLCBjYXRlZ29yeTogJ2JvdHRvbScsIGNvbG9yOiAnb2xpdmUnLCBzaXplOiAnMzInIH1dLFxuICBbJ2Zvb3R3ZWFyLmpwZycsIHsgbmFtZTogJ0JsYWNrIHRyYWluZXJzJywgY2F0ZWdvcnk6ICdmb290d2VhcicsIGNvbG9yOiAnYmxhY2snLCBzaXplOiAnOScgfV0sXG5dO1xuXG4vLyBNZWFzdXJlcyB0aGUgZG9jdW1lbnRlZCBkZXNpZ24tc3lzdGVtIHJ1bGVzIG9uIHJlbmRlcmVkLCB2aXNpYmxlIGNvbnRlbnQuXG5mdW5jdGlvbiBtZWFzdXJlRGVzaWduKCkge1xuICBjb25zdCB2aXNpYmxlID0gKGVsZW1lbnQpID0+IHtcbiAgICBjb25zdCBib3ggPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGNvbnN0IHN0eWxlID0gZ2V0Q29tcHV0ZWRTdHlsZShlbGVtZW50KTtcbiAgICByZXR1cm4gYm94LndpZHRoID4gMCAmJiBib3guaGVpZ2h0ID4gMCAmJiBzdHlsZS52aXNpYmlsaXR5ICE9PSAnaGlkZGVuJyAmJiBzdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG4gIH07XG4gIGNvbnN0IHRleHQgPSBbXTtcbiAgY29uc3Qgd2Fsa2VyID0gZG9jdW1lbnQuY3JlYXRlVHJlZVdhbGtlcihkb2N1bWVudC5ib2R5LCBOb2RlRmlsdGVyLlNIT1dfVEVYVCk7XG4gIHdoaWxlICh3YWxrZXIubmV4dE5vZGUoKSkge1xuICAgIGNvbnN0IG5vZGUgPSB3YWxrZXIuY3VycmVudE5vZGU7XG4gICAgY29uc3QgcGFyZW50ID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICAgIGlmICghcGFyZW50IHx8ICFub2RlLnRleHRDb250ZW50LnRyaW0oKSB8fCBwYXJlbnQuY2xvc2VzdCgnc2NyaXB0LCBzdHlsZSwgb3B0aW9uLCBbYXJpYS1oaWRkZW49XCJ0cnVlXCJdJykgfHwgIXZpc2libGUocGFyZW50KSkgY29udGludWU7XG4gICAgY29uc3Qgc3R5bGUgPSBnZXRDb21wdXRlZFN0eWxlKHBhcmVudCk7XG4gICAgdGV4dC5wdXNoKHsgdGV4dDogbm9kZS50ZXh0Q29udGVudC50cmltKCkuc2xpY2UoMCwgNDApLCBzaXplOiBwYXJzZUZsb2F0KHN0eWxlLmZvbnRTaXplKSwgZmFtaWx5OiBzdHlsZS5mb250RmFtaWx5LnNwbGl0KCcsJylbMF0ucmVwbGFjZSgvW1wiJ10vZywgJycpLnRyaW0oKSB9KTtcbiAgfVxuICBjb25zdCBpbmxpbmVMaW5rID0gKGVsZW1lbnQpID0+IGVsZW1lbnQubWF0Y2hlcygnYScpICYmIGVsZW1lbnQuY2xvc2VzdCgncCwgbGknKSAmJiBlbGVtZW50LmNsb3Nlc3QoJ3AsIGxpJykudGV4dENvbnRlbnQudHJpbSgpICE9PSBlbGVtZW50LnRleHRDb250ZW50LnRyaW0oKTtcbiAgY29uc3QgdGFyZ2V0cyA9IFsuLi5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdhW2hyZWZdLCBidXR0b24sIGlucHV0Om5vdChbdHlwZT1oaWRkZW5dKSwgc2VsZWN0LCB0ZXh0YXJlYSwgc3VtbWFyeScpXVxuICAgIC5maWx0ZXIoKGVsZW1lbnQpID0+IHZpc2libGUoZWxlbWVudCkgJiYgIWlubGluZUxpbmsoZWxlbWVudCkgJiYgIWVsZW1lbnQuY2xvc2VzdCgnW2luZXJ0XScpKVxuICAgIC5tYXAoKGVsZW1lbnQpID0+IHtcbiAgICAgIGNvbnN0IGJveCA9IChlbGVtZW50Lm1hdGNoZXMoJ2lucHV0W3R5cGU9Y2hlY2tib3hdLCBpbnB1dFt0eXBlPXJhZGlvXScpID8gZWxlbWVudC5jbG9zZXN0KCdsYWJlbCcpID8/IGVsZW1lbnQgOiBlbGVtZW50KS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIHJldHVybiB7IG5hbWU6IChlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpIHx8IGVsZW1lbnQudGV4dENvbnRlbnQgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ25hbWUnKSB8fCBlbGVtZW50LnRhZ05hbWUpLnRyaW0oKS5zbGljZSgwLCA0MCksIGhlaWdodDogTWF0aC5yb3VuZChib3guaGVpZ2h0KSwgd2lkdGg6IE1hdGgucm91bmQoYm94LndpZHRoKSB9O1xuICAgIH0pO1xuICByZXR1cm4ge1xuICAgIHNtYWxsVGV4dDogdGV4dC5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeS5zaXplIDwgMTQpLFxuICAgIG90aGVyRmFtaWxpZXM6IFsuLi5uZXcgU2V0KHRleHQubWFwKChlbnRyeSkgPT4gZW50cnkuZmFtaWx5KS5maWx0ZXIoKGZhbWlseSkgPT4gZmFtaWx5ICE9PSAnTWFucm9wZScpKV0sXG4gICAgaDE6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2gxJykubGVuZ3RoLFxuICAgIHNtYWxsVGFyZ2V0czogdGFyZ2V0cy5maWx0ZXIoKHRhcmdldCkgPT4gdGFyZ2V0LmhlaWdodCA8IDQ0IHx8IHRhcmdldC53aWR0aCA8IDI0KSxcbiAgICBvdmVyZmxvdzogZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFdpZHRoID4gd2luZG93LmlubmVyV2lkdGgsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrU2NyZWVuKHBhZ2UsIG5hbWUsIHsgZnVsbFBhZ2UgPSB0cnVlIH0gPSB7fSkge1xuICBmb3IgKGNvbnN0IHdpZHRoIG9mIHdpZHRocykge1xuICAgIGF3YWl0IHRlc3Quc3RlcChgJHtuYW1lfSBhdCAke3dpZHRofXB4YCwgYXN5bmMgKCkgPT4ge1xuICAgICAgYXdhaXQgcGFnZS5zZXRWaWV3cG9ydFNpemUoeyB3aWR0aCwgaGVpZ2h0OiB3aWR0aCA9PT0gMzkwID8gODQ0IDogd2lkdGggPT09IDc2OCA/IDEwMjQgOiA5MDAgfSk7XG4gICAgICBhd2FpdCBwYWdlLmV2YWx1YXRlKGFzeW5jICgpID0+IHtcbiAgICAgICAgYXdhaXQgZG9jdW1lbnQuZm9udHMucmVhZHk7XG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5kb2N1bWVudC5pbWFnZXNdLm1hcCgoaW1hZ2UpID0+IGltYWdlLmRlY29kZSgpLmNhdGNoKCgpID0+IHt9KSkpO1xuICAgICAgfSk7XG4gICAgICBjb25zdCBkZXNpZ24gPSBhd2FpdCBwYWdlLmV2YWx1YXRlKG1lYXN1cmVEZXNpZ24pO1xuICAgICAgZXhwZWN0LnNvZnQoZGVzaWduLnNtYWxsVGV4dCwgJ1Zpc2libGUgdGV4dCBpcyBhdCBsZWFzdCAxNHB4JykudG9FcXVhbChbXSk7XG4gICAgICBleHBlY3Quc29mdChkZXNpZ24ub3RoZXJGYW1pbGllcywgJ1Zpc2libGUgdGV4dCB1c2VzIG9ubHkgTWFucm9wZScpLnRvRXF1YWwoW10pO1xuICAgICAgZXhwZWN0LnNvZnQoZGVzaWduLmgxLCAnVGhlIHNjcmVlbiBoYXMgZXhhY3RseSBvbmUgaDEnKS50b0JlKDEpO1xuICAgICAgZXhwZWN0LnNvZnQoZGVzaWduLnNtYWxsVGFyZ2V0cywgJ0ludGVyYWN0aXZlIHRhcmdldHMgYXJlIGF0IGxlYXN0IDQ0cHggdGFsbCcpLnRvRXF1YWwoW10pO1xuICAgICAgZXhwZWN0LnNvZnQoZGVzaWduLm92ZXJmbG93LCAnTm8gaG9yaXpvbnRhbCBvdmVyZmxvdycpLnRvQmUoZmFsc2UpO1xuICAgICAgYXdhaXQgcGFnZS5ldmFsdWF0ZShheGVTb3VyY2UpO1xuICAgICAgY29uc3QgdmlvbGF0aW9ucyA9IGF3YWl0IHBhZ2UuZXZhbHVhdGUoYXN5bmMgKCkgPT4gKGF3YWl0IHdpbmRvdy5heGUucnVuKGRvY3VtZW50LCB7IHJ1bk9ubHk6IHsgdHlwZTogJ3RhZycsIHZhbHVlczogWyd3Y2FnMmEnLCAnd2NhZzJhYScsICd3Y2FnMjFhJywgJ3djYWcyMWFhJywgJ3djYWcyMmFhJ10gfSB9KSlcbiAgICAgICAgLnZpb2xhdGlvbnMubWFwKCh7IGlkLCBub2RlcyB9KSA9PiAoeyBpZCwgdGFyZ2V0czogbm9kZXMubWFwKChub2RlKSA9PiBub2RlLnRhcmdldC5qb2luKCcgJykpIH0pKSk7XG4gICAgICBleHBlY3Quc29mdCh2aW9sYXRpb25zLCAnYXhlIFdDQUcgMi4yIEFBIHZpb2xhdGlvbnMnKS50b0VxdWFsKFtdKTtcbiAgICAgIGlmIChjb21wYXJlU2NyZWVuc2hvdHMgJiYgZnVsbFBhZ2UpIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gd2luZG93LnNjcm9sbFRvKDAsIDApKTtcbiAgICAgIGlmIChjb21wYXJlU2NyZWVuc2hvdHMpIGF3YWl0IGV4cGVjdC5zb2Z0KHBhZ2UpLnRvSGF2ZVNjcmVlbnNob3QoYCR7bmFtZX0tJHt3aWR0aH0ucG5nYCwgeyBmdWxsUGFnZSB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBhcGkocGFnZSwgbWV0aG9kLCB1cmwsIGJvZHkpIHtcbiAgcmV0dXJuIHBhZ2UuZXZhbHVhdGUoYXN5bmMgKFt2ZXJiLCBwYXRoLCBkYXRhXSkgPT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocGF0aCwgeyBtZXRob2Q6IHZlcmIsIGNyZWRlbnRpYWxzOiAnc2FtZS1vcmlnaW4nLCBoZWFkZXJzOiBkYXRhID8geyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0gOiB7fSwgYm9keTogZGF0YSA/IEpTT04uc3RyaW5naWZ5KGRhdGEpIDogdW5kZWZpbmVkIH0pO1xuICAgIHJldHVybiB7IHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLCBib2R5OiBhd2FpdCByZXNwb25zZS5qc29uKCkuY2F0Y2goKCkgPT4gbnVsbCkgfTtcbiAgfSwgW21ldGhvZCwgdXJsLCBib2R5XSk7XG59XG5cbi8vIFRoZSBzZXJ2ZXIgYWxsb3dzIGZpdmUgc2lnbi11cHMgYSBtaW51dGUgYWNyb3NzIHRoZSB3aG9sZSBydW4sIHNvIGEgcmVmdXNlZCBzaWduLXVwIHdhaXRzIG91dCB0aGUgd2luZG93IHJhdGhlciB0aGFuIHdlYWtlbmluZyB0aGUgbGltaXQuXG5hc3luYyBmdW5jdGlvbiBzaWduVXAocGFnZSwgZW1haWwpIHtcbiAgYXdhaXQgcGFnZS5nb3RvKCcvc2lnbi1pbicpO1xuICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgOyBhdHRlbXB0ICs9IDEpIHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGFwaShwYWdlLCAnUE9TVCcsICcvYXBpL2F1dGgvc2lnbi11cC9lbWFpbCcsIHsgbmFtZTogJ1F1YWxpdHkgY2hlY2snLCBlbWFpbCwgcGFzc3dvcmQsIGFkdWx0Q29uZmlybWVkOiB0cnVlLCBjYWxsYmFja1VSTDogbmV3IFVSTChwYWdlLnVybCgpKS5vcmlnaW4gfSk7XG4gICAgaWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDI5ICYmIGF0dGVtcHQgPCAyKSB7IHRlc3Quc2V0VGltZW91dCh0ZXN0LmluZm8oKS50aW1lb3V0ICsgNjVfMDAwKTsgYXdhaXQgcGFnZS53YWl0Rm9yVGltZW91dCg2MV8wMDApOyBjb250aW51ZTsgfVxuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICByZXR1cm47XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYWRkV2FyZHJvYmUocGFnZSwgeyB1bmNlcnRhaW5GaXQgPSBmYWxzZSB9ID0ge30pIHtcbiAgZm9yIChjb25zdCBbZmlsZSwgZmFjdHNdIG9mIHdhcmRyb2JlKSB7XG4gICAgY29uc3QgaW1hZ2UgPSAoYXdhaXQgc2hhcnAoZml4dHVyZShmaWxlKSkucmVzaXplKDEyMDAsIDEyMDAsIHsgZml0OiAnaW5zaWRlJyB9KS5qcGVnKHsgcXVhbGl0eTogODUgfSkudG9CdWZmZXIoKSkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYXBpKHBhZ2UsICdQT1NUJywgJy9hcGkvd2FyZHJvYmUnLCB7IGNvbnNlbnQ6IHRydWUsIGltYWdlLCBmYWN0czogeyAuLi5mYWN0cywgZml0OiB1bmNlcnRhaW5GaXQgJiYgZmFjdHMuY2F0ZWdvcnkgPT09ICd0b3AnID8gJ3Vua25vd24nIDogJ2ZpdHMnLCBvd25lZDogdHJ1ZSwgYXZhaWxhYmxlOiB0cnVlLCB3ZWF0aGVyOiBbJ21pbGQnXSwgZHJlc3NDb2RlOiBbJ2Nhc3VhbCcsICdzbWFydC1jYXN1YWwnXSB9IH0pO1xuICAgIGV4cGVjdChyZXNwb25zZS5zdGF0dXMpLnRvQmUoMjAxKTtcbiAgfVxufVxuXG50ZXN0LmJlZm9yZUVhY2goYXN5bmMgKHsgcGFnZSB9KSA9PiB7XG4gIC8vIFRoZSBmb250IHVzZXMgZm9udC1kaXNwbGF5OiBvcHRpb25hbCwgc28gbG9hZCBpdCBpbnRvIHRoZSBjYWNoZSBiZWZvcmUgdGhlIGZpcnN0IG1lYXN1cmVkIHJlbmRlci5cbiAgYXdhaXQgcGFnZS5nb3RvKCcvJyk7XG4gIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4gZG9jdW1lbnQuZm9udHMubG9hZCgnMTZweCBNYW5yb3BlJykpO1xufSk7XG5cbnRlc3QoJ3B1YmxpYyBwYWdlJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XG4gIGF3YWl0IHBhZ2UuZ290bygnLycpO1xuICBhd2FpdCBjaGVja1NjcmVlbihwYWdlLCAncHVibGljJyk7XG59KTtcblxudGVzdCgnYWNjb3VudCBlbnRyeScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xuICBhd2FpdCBwYWdlLmdvdG8oJy9zaWduLWluJyk7XG4gIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5Um9sZSgnaGVhZGluZycsIHsgbGV2ZWw6IDEsIG5hbWU6ICdTaWduIGluJyB9KSkudG9CZVZpc2libGUoKTtcbiAgYXdhaXQgY2hlY2tTY3JlZW4ocGFnZSwgJ3NpZ24taW4nKTtcbiAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ0NyZWF0ZSBhbiBhY2NvdW50JyB9KS5jbGljaygpO1xuICBhd2FpdCBleHBlY3QocGFnZSkudG9IYXZlVVJMKC9cXC9zaWduLXVwJC8pO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeUxhYmVsKCdZb3VyIG5hbWUnKSkudG9CZUZvY3VzZWQoKTtcbiAgYXdhaXQgY2hlY2tTY3JlZW4ocGFnZSwgJ3NpZ24tdXAnKTtcbiAgYXdhaXQgcGFnZS5nZXRCeUxhYmVsKCdZb3VyIG5hbWUnKS5maWxsKCdRdWFsaXR5IGNoZWNrJyk7XG4gIGF3YWl0IHBhZ2UuZ2V0QnlMYWJlbCgnRW1haWwnKS5maWxsKCdlbnRyeUBleGFtcGxlLnRlc3QnKTtcbiAgYXdhaXQgcGFnZS5nZXRCeUxhYmVsKCdQYXNzd29yZCcpLmZpbGwocGFzc3dvcmQpO1xuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnQ3JlYXRlIGFjY291bnQnIH0pLmNsaWNrKCk7XG4gIGNvbnN0IGFsZXJ0ID0gcGFnZS5nZXRCeVJvbGUoJ2FsZXJ0Jyk7XG4gIGF3YWl0IGV4cGVjdChhbGVydCkudG9Db250YWluVGV4dCgnMTggb3Igb2xkZXInKTtcbiAgYXdhaXQgZXhwZWN0KGFsZXJ0KS50b0JlRm9jdXNlZCgpO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVJvbGUoJ2NoZWNrYm94JywgeyBuYW1lOiAvMTggb3Igb2xkZXIvIH0pKS50b0hhdmVBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcsICd0cnVlJyk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICdzaWduLXVwLWVycm9yJyk7XG59KTtcblxudGVzdCgnZW1wdHkgd2FyZHJvYmUgYW5kIGdhcm1lbnQgdXBsb2FkJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XG4gIGF3YWl0IHNpZ25VcChwYWdlLCAndXBsb2FkQGV4YW1wbGUudGVzdCcpO1xuICBhd2FpdCBwYWdlLmdvdG8oJy93YXJkcm9iZScpO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVJvbGUoJ2hlYWRpbmcnLCB7IGxldmVsOiAxLCBuYW1lOiAnWW91ciB3YXJkcm9iZScgfSkpLnRvQmVGb2N1c2VkKCk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICd3YXJkcm9iZS1lbXB0eScpO1xuXG4gIGNvbnN0IGFkZCA9IHBhZ2UubG9jYXRvcignI2FkZC1nYXJtZW50Jyk7XG4gIGF3YWl0IGFkZC5jbGljaygpO1xuICBjb25zdCBkaWFsb2cgPSBwYWdlLmdldEJ5Um9sZSgnZGlhbG9nJywgeyBuYW1lOiAnQWRkIGEgZ2FybWVudCcgfSk7XG4gIGF3YWl0IGV4cGVjdChkaWFsb2cpLnRvQmVWaXNpYmxlKCk7XG4gIGF3YWl0IGV4cGVjdChkaWFsb2cuZ2V0QnlSb2xlKCdjaGVja2JveCcsIHsgbmFtZTogL3Blcm1pc3Npb24gdG8gdXNlIGl0cyBwaG90by8gfSkpLnRvQmVGb2N1c2VkKCk7XG4gIGF3YWl0IGV4cGVjdChkaWFsb2cuZ2V0QnlMYWJlbCgnR2FybWVudCBwaG90bycpKS50b0JlRGlzYWJsZWQoKTtcbiAgYXdhaXQgY2hlY2tTY3JlZW4ocGFnZSwgJ2dhcm1lbnQtZGlhbG9nJywgeyBmdWxsUGFnZTogZmFsc2UgfSk7XG4gIGF3YWl0IHBhZ2Uua2V5Ym9hcmQucHJlc3MoJ0VzY2FwZScpO1xuICBhd2FpdCBleHBlY3QoZGlhbG9nKS50b0JlSGlkZGVuKCk7XG4gIGF3YWl0IGV4cGVjdChhZGQpLnRvQmVGb2N1c2VkKCk7XG5cbiAgYXdhaXQgYWRkLmNsaWNrKCk7XG4gIGF3YWl0IGRpYWxvZy5nZXRCeVJvbGUoJ2NoZWNrYm94JywgeyBuYW1lOiAvcGVybWlzc2lvbiB0byB1c2UgaXRzIHBob3RvLyB9KS5jaGVjaygpO1xuICBhd2FpdCBwYWdlLnJvdXRlKCdodHRwczovL2h1Z2dpbmdmYWNlLmNvLyoqJywgKHJvdXRlKSA9PiByb3V0ZS5hYm9ydCgnaW50ZXJuZXRkaXNjb25uZWN0ZWQnKSk7XG4gIGF3YWl0IGRpYWxvZy5nZXRCeUxhYmVsKCdHYXJtZW50IHBob3RvJykuc2V0SW5wdXRGaWxlcyhmaXh0dXJlKCd0b3AuanBnJykpO1xuICBhd2FpdCBleHBlY3QoZGlhbG9nLmdldEJ5VGV4dCgnQ2hvb3NlIGEgZGlmZmVyZW50IHBob3RvJykpLnRvQmVWaXNpYmxlKHsgdGltZW91dDogMzBfMDAwIH0pO1xuICBhd2FpdCBleHBlY3QoZGlhbG9nLmdldEJ5TGFiZWwoJ05hbWUnLCB7IGV4YWN0OiB0cnVlIH0pKS50b0JlRm9jdXNlZCgpO1xuICBhd2FpdCBleHBlY3QoZGlhbG9nLmdldEJ5VGV4dCgvSW1hZ2UgY2xhc3NpZmljYXRpb24gaXMgdW5hdmFpbGFibGUgb24gdGhpcyBkZXZpY2Ugb3IgY29ubmVjdGlvbi8pKS50b0JlVmlzaWJsZSgpO1xuICBhd2FpdCBjaGVja1NjcmVlbihwYWdlLCAnZ2FybWVudC1kaWFsb2ctcmV2aWV3ZWQnLCB7IGZ1bGxQYWdlOiBmYWxzZSB9KTtcbn0pO1xuXG50ZXN0KCd3YXJkcm9iZSwgb3V0Zml0IHN1Z2dlc3Rpb24gYW5kIGFjY291bnQnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcbiAgYXdhaXQgc2lnblVwKHBhZ2UsICdvdXRmaXRAZXhhbXBsZS50ZXN0Jyk7XG4gIGF3YWl0IGFkZFdhcmRyb2JlKHBhZ2UpO1xuICBhd2FpdCBwYWdlLmdvdG8oJy93YXJkcm9iZScpO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVJvbGUoJ2ltZycsIHsgbmFtZTogJ0JsYWNrIHRyYWluZXJzJyB9KSkudG9CZVZpc2libGUoKTtcbiAgYXdhaXQgY2hlY2tTY3JlZW4ocGFnZSwgJ3dhcmRyb2JlLWZpbGxlZCcpO1xuXG4gIGNvbnN0IG9jY2FzaW9uID0gcGFnZS5nZXRCeUxhYmVsKCdPY2Nhc2lvbicsIHsgZXhhY3Q6IHRydWUgfSk7XG4gIGF3YWl0IG9jY2FzaW9uLmZpbGwoJ0Rpbm5lciB3aXRoIGZyaWVuZHMnKTtcbiAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ0ZpbmQgYW4gb3V0Zml0JyB9KS5jbGljaygpO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVRleHQoJ1doYXQgd2VhdGhlciBzaG91bGQgdGhpcyBvdXRmaXQgd29yayBmb3I/JykpLnRvQmVGb2N1c2VkKCk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICdvdXRmaXQtcXVlc3Rpb24nKTtcblxuICBhd2FpdCBwYWdlLmdldEJ5TGFiZWwoJ1dlYXRoZXInLCB7IGV4YWN0OiB0cnVlIH0pLnNlbGVjdE9wdGlvbignbWlsZCcpO1xuICBhd2FpdCBwYWdlLmdldEJ5TGFiZWwoJ0RyZXNzIGNvZGUnLCB7IGV4YWN0OiB0cnVlIH0pLnNlbGVjdE9wdGlvbignY2FzdWFsJyk7XG4gIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdGaW5kIGFuIG91dGZpdCcgfSkuY2xpY2soKTtcbiAgY29uc3QgcmVzdWx0ID0gcGFnZS5nZXRCeVJvbGUoJ2hlYWRpbmcnLCB7IG5hbWU6ICdZb3VyIG91dGZpdCBmb3IgRGlubmVyIHdpdGggZnJpZW5kcycgfSk7XG4gIGF3YWl0IGV4cGVjdChyZXN1bHQpLnRvQmVGb2N1c2VkKCk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICdvdXRmaXQtcmVzdWx0Jyk7XG5cbiAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2xpbmsnLCB7IG5hbWU6ICdBY2NvdW50JyB9KS5jbGljaygpO1xuICBhd2FpdCBleHBlY3QocGFnZSkudG9IYXZlVVJMKC9cXC9hY2NvdW50JC8pO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVJvbGUoJ2hlYWRpbmcnLCB7IGxldmVsOiAxLCBuYW1lOiAnQWNjb3VudCcgfSkpLnRvQmVGb2N1c2VkKCk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICdhY2NvdW50Jyk7XG59KTtcblxudGVzdCgnY29uY3VycmVudCB3YXJkcm9iZSByZWZyZXNoZXMgYW5kIGVkaXRzIHByZXNlcnZlIGNvbmZpcm1lZCBmYWN0cycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xuICBhd2FpdCBzaWduVXAocGFnZSwgYGNvbmN1cnJlbnQtJHtyYW5kb21VVUlEKCl9QGV4YW1wbGUudGVzdGApO1xuICBmb3IgKGNvbnN0IGFjdGlvbiBvZiBbJ2VkaXQnLCAncmVtb3ZlJ10pIHtcbiAgICBhd2FpdCB0ZXN0LnN0ZXAoYWN0aW9uLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBwcmV2aW91cyA9IGF3YWl0IGFwaShwYWdlLCAnR0VUJywgJy9hcGkvd2FyZHJvYmUnKTtcbiAgICAgIGV4cGVjdChwcmV2aW91cy5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBwcmV2aW91cy5ib2R5KSBleHBlY3QoKGF3YWl0IGFwaShwYWdlLCAnREVMRVRFJywgYC9hcGkvd2FyZHJvYmUvJHtpdGVtLmlkfWApKS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICAgIGF3YWl0IGFkZFdhcmRyb2JlKHBhZ2UsIHsgdW5jZXJ0YWluRml0OiB0cnVlIH0pO1xuICAgICAgYXdhaXQgcGFnZS5nb3RvKCcvd2FyZHJvYmUnKTtcbiAgICAgIGF3YWl0IHBhZ2UuZ2V0QnlMYWJlbCgnT2NjYXNpb24nLCB7IGV4YWN0OiB0cnVlIH0pLmZpbGwoJ0Rpbm5lcicpO1xuICAgICAgYXdhaXQgcGFnZS5nZXRCeUxhYmVsKCdXZWF0aGVyJywgeyBleGFjdDogdHJ1ZSB9KS5zZWxlY3RPcHRpb24oJ21pbGQnKTtcbiAgICAgIGF3YWl0IHBhZ2UuZ2V0QnlMYWJlbCgnRHJlc3MgY29kZScsIHsgZXhhY3Q6IHRydWUgfSkuc2VsZWN0T3B0aW9uKCdjYXN1YWwnKTtcbiAgICAgIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdGaW5kIGFuIG91dGZpdCcgfSkuY2xpY2soKTtcbiAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnWWVzLCBpdCBmaXRzJywgZXhhY3Q6IHRydWUgfSkpLnRvQmVWaXNpYmxlKCk7XG5cbiAgICAgIGNvbnN0IGhlbGQgPSBQcm9taXNlLndpdGhSZXNvbHZlcnMoKTtcbiAgICAgIGNvbnN0IGNhcHR1cmVkID0gUHJvbWlzZS53aXRoUmVzb2x2ZXJzKCk7XG4gICAgICBjb25zdCBkZWxpdmVyZWQgPSBQcm9taXNlLndpdGhSZXNvbHZlcnMoKTtcbiAgICAgIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2FwaS93YXJkcm9iZScsIGFzeW5jIChyb3V0ZSkgPT4ge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJvdXRlLmZldGNoKCk7XG4gICAgICAgIGNhcHR1cmVkLnJlc29sdmUoKTtcbiAgICAgICAgYXdhaXQgaGVsZC5wcm9taXNlO1xuICAgICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHsgcmVzcG9uc2UgfSk7XG4gICAgICAgIGRlbGl2ZXJlZC5yZXNvbHZlKCk7XG4gICAgICB9LCB7IHRpbWVzOiAxIH0pO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ1llcywgaXQgZml0cycsIGV4YWN0OiB0cnVlIH0pLmNsaWNrKCk7XG4gICAgICAgIGF3YWl0IGNhcHR1cmVkLnByb21pc2U7XG4gICAgICAgIGlmIChhY3Rpb24gPT09ICdlZGl0Jykge1xuICAgICAgICAgIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdFZGl0IEdyZXkgY3JldyB0ZWUnLCBleGFjdDogdHJ1ZSB9KS5jbGljaygpO1xuICAgICAgICAgIGNvbnN0IGRpYWxvZyA9IHBhZ2UuZ2V0QnlSb2xlKCdkaWFsb2cnLCB7IG5hbWU6ICdFZGl0IEdyZXkgY3JldyB0ZWUnLCBleGFjdDogdHJ1ZSB9KTtcbiAgICAgICAgICBhd2FpdCBkaWFsb2cuZ2V0QnlMYWJlbCgnTmFtZScsIHsgZXhhY3Q6IHRydWUgfSkuZmlsbCgnUmVuYW1lZCB0ZWUnKTtcbiAgICAgICAgICBhd2FpdCBkaWFsb2cuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdTYXZlIGNoYW5nZXMnIH0pLmNsaWNrKCk7XG4gICAgICAgICAgYXdhaXQgZXhwZWN0KGRpYWxvZykudG9CZUhpZGRlbigpO1xuICAgICAgICAgIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdFZGl0IFJlbmFtZWQgdGVlJywgZXhhY3Q6IHRydWUgfSkuY2xpY2soKTtcbiAgICAgICAgICBjb25zdCB1bmNoYW5nZWQgPSBwYWdlLmdldEJ5Um9sZSgnZGlhbG9nJywgeyBuYW1lOiAnRWRpdCBSZW5hbWVkIHRlZScsIGV4YWN0OiB0cnVlIH0pO1xuICAgICAgICAgIGNvbnN0IHBhdGNoZXMgPSBbXTtcbiAgICAgICAgICBjb25zdCByZWNvcmRQYXRjaCA9IChyZXF1ZXN0KSA9PiB7IGlmIChyZXF1ZXN0Lm1ldGhvZCgpID09PSAnUEFUQ0gnKSBwYXRjaGVzLnB1c2gocmVxdWVzdC51cmwoKSk7IH07XG4gICAgICAgICAgcGFnZS5vbigncmVxdWVzdCcsIHJlY29yZFBhdGNoKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgdW5jaGFuZ2VkLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnU2F2ZSBjaGFuZ2VzJyB9KS5jbGljaygpO1xuICAgICAgICAgICAgYXdhaXQgZXhwZWN0KHVuY2hhbmdlZCkudG9CZUhpZGRlbigpO1xuICAgICAgICAgICAgZXhwZWN0LnNvZnQocGF0Y2hlcykudG9FcXVhbChbXSk7XG4gICAgICAgICAgfSBmaW5hbGx5IHsgcGFnZS5vZmYoJ3JlcXVlc3QnLCByZWNvcmRQYXRjaCk7IH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnUmVtb3ZlIEJsYWNrIHRyYWluZXJzJywgZXhhY3Q6IHRydWUgfSkuY2xpY2soKTtcbiAgICAgICAgICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnWWVzLCByZW1vdmUnLCBleGFjdDogdHJ1ZSB9KS5jbGljaygpO1xuICAgICAgICAgIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5Um9sZSgnaGVhZGluZycsIHsgbmFtZTogJ0JsYWNrIHRyYWluZXJzJywgZXhhY3Q6IHRydWUgfSkpLnRvSGF2ZUNvdW50KDApO1xuICAgICAgICB9XG4gICAgICAgIGhlbGQucmVzb2x2ZSgpO1xuICAgICAgICBhd2FpdCBkZWxpdmVyZWQucHJvbWlzZTtcbiAgICAgICAgYXdhaXQgZXhwZWN0KHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdGaW5kIGFuIG91dGZpdCcgfSkpLnRvQmVFbmFibGVkKHsgdGltZW91dDogMjBfMDAwIH0pO1xuICAgICAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgYXBpKHBhZ2UsICdHRVQnLCAnL2FwaS93YXJkcm9iZScpO1xuICAgICAgICBleHBlY3QoY3VycmVudC5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ2VkaXQnKSB7XG4gICAgICAgICAgY29uc3QgdG9wID0gY3VycmVudC5ib2R5LmZpbmQoKGl0ZW0pID0+IGl0ZW0uZmFjdHMuY2F0ZWdvcnkgPT09ICd0b3AnKTtcbiAgICAgICAgICBleHBlY3Quc29mdCh0b3AuZmFjdHMubmFtZSkudG9CZSgnUmVuYW1lZCB0ZWUnKTtcbiAgICAgICAgICBleHBlY3Quc29mdCh0b3AuZmFjdHMuZml0KS50b0JlKCdmaXRzJyk7XG4gICAgICAgICAgYXdhaXQgZXhwZWN0LnNvZnQocGFnZS5nZXRCeVJvbGUoJ2FydGljbGUnLCB7IG5hbWU6ICdSZW5hbWVkIHRlZScgfSkpLnRvQmVWaXNpYmxlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZXhwZWN0KGN1cnJlbnQuYm9keS5zb21lKChpdGVtKSA9PiBpdGVtLmZhY3RzLmNhdGVnb3J5ID09PSAnZm9vdHdlYXInKSkudG9CZShmYWxzZSk7XG4gICAgICAgICAgYXdhaXQgZXhwZWN0LnNvZnQocGFnZS5nZXRCeVJvbGUoJ2hlYWRpbmcnLCB7IG5hbWU6ICdCbGFjayB0cmFpbmVycycsIGV4YWN0OiB0cnVlIH0pKS50b0hhdmVDb3VudCgwKTtcbiAgICAgICAgfVxuICAgICAgfSBmaW5hbGx5IHsgaGVsZC5yZXNvbHZlKCk7IH1cbiAgICB9KTtcbiAgfVxufSk7XG5cbnRlc3QoJ3BsYW4gcGFnZScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xuICBhd2FpdCBwYWdlLmdvdG8oJy9wbGFuJyk7XG4gIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5Um9sZSgnaGVhZGluZycsIHsgbGV2ZWw6IDEgfSkpLnRvSGF2ZVRleHQoJ1NlZSB5b3VyIG91dGZpdCBpbiBhIG1pbnV0ZS4nKTtcbiAgYXdhaXQgY2hlY2tTY3JlZW4ocGFnZSwgJ3BsYW4tZW1wdHknKTtcbn0pO1xuXG50ZXN0KCd2aXNpdG9yIGdldHMgYW4gb3V0Zml0IGJvYXJkIHdpdGhvdXQgYW4gYWNjb3VudCwgdGhlbiBzYXZlcyBpdCBhZnRlciBzaWduLXVwJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XG4gIGNvbnN0IGhvc3RzID0gbmV3IFNldCgpO1xuICBjb25zdCBzdGVwcyA9IFtdO1xuICBwYWdlLm9uKCdyZXF1ZXN0JywgKHJlcXVlc3QpID0+IHtcbiAgICBob3N0cy5hZGQobmV3IFVSTChyZXF1ZXN0LnVybCgpKS5ob3N0KTtcbiAgICBpZiAocmVxdWVzdC51cmwoKS5lbmRzV2l0aCgnL2FwaS9mdW5uZWwnKSkgc3RlcHMucHVzaChyZXF1ZXN0LnBvc3REYXRhSlNPTigpLmV2ZW50KTtcbiAgfSk7XG4gIGF3YWl0IHBhZ2UuZ290bygnLycpO1xuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnbGluaycsIHsgbmFtZTogJ1BsYW4gYW4gb3V0Zml0IG5vdycgfSkuY2xpY2soKTtcbiAgYXdhaXQgZXhwZWN0KHBhZ2UpLnRvSGF2ZVVSTCgvXFwvcGxhbiQvKTtcbiAgYXdhaXQgcGFnZS5nZXRCeUxhYmVsKCdXaGF0IGlzIHRoZSBvY2Nhc2lvbj8nKS5maWxsKCdEaW5uZXIgd2l0aCBmcmllbmRzJyk7XG4gIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdyYWRpbycsIHsgbmFtZTogJ0NvbGQnIH0pLmNoZWNrKCk7XG4gIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdTaG93IG15IG91dGZpdCcgfSkuY2xpY2soKTtcbiAgY29uc3QgaGVhZGluZyA9IHBhZ2UuZ2V0QnlSb2xlKCdoZWFkaW5nJywgeyBuYW1lOiAnWW91ciBvdXRmaXQgZm9yIERpbm5lciB3aXRoIGZyaWVuZHMnIH0pO1xuICBhd2FpdCBleHBlY3QoaGVhZGluZykudG9CZUZvY3VzZWQoKTtcbiAgY29uc3QgYm9hcmQgPSBwYWdlLmdldEJ5Um9sZSgnZmlndXJlJyk7XG4gIGF3YWl0IGV4cGVjdChib2FyZC5nZXRCeVJvbGUoJ2ltZycpKS50b0hhdmVDb3VudCgzKTtcbiAgYXdhaXQgZXhwZWN0LnBvbGwoKCkgPT4gYm9hcmQubG9jYXRvcignaW1nJykuZXZhbHVhdGVBbGwoKGltYWdlcykgPT4gaW1hZ2VzLmV2ZXJ5KChpbWFnZSkgPT4gaW1hZ2UuY29tcGxldGUgJiYgaW1hZ2UubmF0dXJhbFdpZHRoID4gMCkpKS50b0JlKHRydWUpO1xuICBhd2FpdCBleHBlY3QocGFnZS5nZXRCeVJvbGUoJ2hlYWRpbmcnLCB7IG5hbWU6ICdXaHkgdGhpcyB3b3JrcycgfSkpLnRvQmVWaXNpYmxlKCk7XG4gIGF3YWl0IGV4cGVjdChwYWdlLmdldEJ5VGV4dCgnRm9yIGNvbGQgd2VhdGhlcicpKS50b0JlVmlzaWJsZSgpO1xuICBjb25zdCBhbHRzID0gKCkgPT4gYm9hcmQubG9jYXRvcignaW1nJykuZXZhbHVhdGVBbGwoKGltYWdlcykgPT4gaW1hZ2VzLm1hcCgoaW1hZ2UpID0+IGltYWdlLmFsdCkpO1xuICBjb25zdCBmaXJzdCA9IGF3YWl0IGFsdHMoKTtcbiAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ0xvb2sgMicgfSkuY2xpY2soKTtcbiAgYXdhaXQgZXhwZWN0KHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdMb29rIDInIH0pKS50b0hhdmVBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsICd0cnVlJyk7XG4gIGV4cGVjdChhd2FpdCBhbHRzKCkpLm5vdC50b0VxdWFsKGZpcnN0KTtcbiAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ0xvb2sgMScgfSkuY2xpY2soKTtcbiAgZXhwZWN0KGF3YWl0IGFsdHMoKSkudG9FcXVhbChmaXJzdCk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICdwbGFuLXJlc3VsdCcpO1xuICBjb25zdCBkb3dubG9hZGluZyA9IHBhZ2Uud2FpdEZvckV2ZW50KCdkb3dubG9hZCcpO1xuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnRG93bmxvYWQgYXMgaW1hZ2UnIH0pLmNsaWNrKCk7XG4gIGV4cGVjdCgoYXdhaXQgZG93bmxvYWRpbmcpLnN1Z2dlc3RlZEZpbGVuYW1lKCkpLnRvQmUoJ2dldHlvdXJmaXQtb3V0Zml0LnBuZycpO1xuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnU2F2ZSB0aGlzIG91dGZpdCcgfSkuY2xpY2soKTtcbiAgYXdhaXQgZXhwZWN0KHBhZ2UpLnRvSGF2ZVVSTCgvXFwvc2lnbi11cCQvKTtcbiAgYXdhaXQgcGFnZS5nZXRCeUxhYmVsKCdZb3VyIG5hbWUnKS5maWxsKCdWaXNpdG9yJyk7XG4gIGF3YWl0IHBhZ2UuZ2V0QnlMYWJlbCgnRW1haWwnLCB7IGV4YWN0OiB0cnVlIH0pLmZpbGwoYHZpc2l0b3ItJHtyYW5kb21VVUlEKCl9QGV4YW1wbGUudGVzdGApO1xuICBhd2FpdCBwYWdlLmdldEJ5TGFiZWwoJ1Bhc3N3b3JkJywgeyBleGFjdDogdHJ1ZSB9KS5maWxsKHBhc3N3b3JkKTtcbiAgYXdhaXQgcGFnZS5nZXRCeVJvbGUoJ2NoZWNrYm94JywgeyBuYW1lOiAvMTggb3Igb2xkZXIvIH0pLmNoZWNrKCk7XG4gIGF3YWl0IHBhZ2UuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdDcmVhdGUgYWNjb3VudCcsIGV4YWN0OiB0cnVlIH0pLmNsaWNrKCk7XG4gIGlmIChhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYWxlcnQnKS5maXJzdCgpLmlzVmlzaWJsZSh7IHRpbWVvdXQ6IDE1MDAgfSkuY2F0Y2goKCkgPT4gZmFsc2UpKSB7XG4gICAgdGVzdC5zZXRUaW1lb3V0KHRlc3QuaW5mbygpLnRpbWVvdXQgKyA2NV8wMDApO1xuICAgIGF3YWl0IHBhZ2Uud2FpdEZvclRpbWVvdXQoNjFfMDAwKTtcbiAgICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgnYnV0dG9uJywgeyBuYW1lOiAnQ3JlYXRlIGFjY291bnQnLCBleGFjdDogdHJ1ZSB9KS5jbGljaygpO1xuICB9XG4gIGNvbnN0IGJ1aWxkZXIgPSBwYWdlLmxvY2F0b3IoJyNidWlsZC1wbGFuJyk7XG4gIGF3YWl0IGV4cGVjdChidWlsZGVyLmdldEJ5Um9sZSgnaGVhZGluZycsIHsgbmFtZTogJ05lZWRzIGZvciBEaW5uZXIgd2l0aCBmcmllbmRzJyB9KSkudG9CZVZpc2libGUoKTtcbiAgYXdhaXQgYnVpbGRlci5nZXRCeVJvbGUoJ2J1dHRvbicsIHsgbmFtZTogJ1NhdmUgcGxhbicgfSkuY2xpY2soKTtcbiAgYXdhaXQgZXhwZWN0KGJ1aWxkZXIuZ2V0QnlSb2xlKCdzdGF0dXMnKS5maWx0ZXIoeyBoYXNUZXh0OiAnUGxhbiBzYXZlZCcgfSkpLnRvQmVWaXNpYmxlKCk7XG4gIGF3YWl0IGV4cGVjdC5wb2xsKCgpID0+IHN0ZXBzLmluY2x1ZGVzKCdwbGFuX3NhdmVkX2FmdGVyX3Zpc2l0JykpLnRvQmUodHJ1ZSk7XG4gIGV4cGVjdChzdGVwcykudG9FcXVhbChbJ3BsYW5fb3BlbmVkJywgJ3BsYW5fc3VibWl0dGVkJywgJ291dGZpdF9zaG93bicsICdzYXZlX3Byb21wdF9zaG93bicsICdzYXZlX3Byb21wdF9hY2NlcHRlZCcsICdwbGFuX3NhdmVkX2FmdGVyX3Zpc2l0J10pO1xuICBleHBlY3QoWy4uLmhvc3RzXSkudG9FcXVhbChbbmV3IFVSTChwYWdlLnVybCgpKS5ob3N0XSk7XG59KTtcblxudGVzdCgnc3RhcnRlciBwbGFuIHdpdGggc2hvcHBpbmcgbGlua3MnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcbiAgYXdhaXQgc2lnblVwKHBhZ2UsICdwbGFuQGV4YW1wbGUudGVzdCcpO1xuICBhd2FpdCBwYWdlLmdvdG8oJy93YXJkcm9iZScpO1xuICBjb25zdCBidWlsZGVyID0gcGFnZS5sb2NhdG9yKCcjYnVpbGQtcGxhbicpO1xuICBhd2FpdCBidWlsZGVyLmdldEJ5TGFiZWwoJ1doYXQgaXMgdGhlIG9jY2FzaW9uPycpLmZpbGwoJ0NvbGxlZ2UgZGF5cycpO1xuICBhd2FpdCBidWlsZGVyLmdldEJ5TGFiZWwoJ1NwZW5kaW5nIGNlaWxpbmcnKS5maWxsKCczMDAwJyk7XG4gIGF3YWl0IGJ1aWxkZXIuZ2V0QnlMYWJlbCgnUGxhbiB3ZWF0aGVyJykuc2VsZWN0T3B0aW9uKCd3YXJtJyk7XG4gIGF3YWl0IGJ1aWxkZXIuZ2V0QnlMYWJlbCgnUGxhbiBkcmVzcyBjb2RlJykuc2VsZWN0T3B0aW9uKCdjYXN1YWwnKTtcbiAgYXdhaXQgYnVpbGRlci5nZXRCeUxhYmVsKCdJIGFscmVhZHkgaGF2ZSBzdWl0YWJsZSBmb290d2VhcicpLmNoZWNrKCk7XG4gIGF3YWl0IGJ1aWxkZXIuZ2V0QnlSb2xlKCdidXR0b24nLCB7IG5hbWU6ICdNYWtlIG15IHN0YXJ0ZXIgcGxhbicgfSkuY2xpY2soKTtcbiAgYXdhaXQgZXhwZWN0KGJ1aWxkZXIuZ2V0QnlSb2xlKCdoZWFkaW5nJywgeyBuYW1lOiAnTmVlZHMgZm9yIENvbGxlZ2UgZGF5cycgfSkpLnRvQmVGb2N1c2VkKCk7XG4gIGNvbnN0IHNob3AgPSBidWlsZGVyLmdldEJ5Um9sZSgncmVnaW9uJywgeyBuYW1lOiAnV2hlcmUgdG8gc2hvcCBmb3IgdGhpcyBvdXRmaXQnIH0pO1xuICBhd2FpdCBzaG9wLmdldEJ5Um9sZSgncmFkaW8nLCB7IG5hbWU6ICdNZW7igJlzJywgZXhhY3Q6IHRydWUgfSkuY2hlY2soKTtcbiAgYXdhaXQgZXhwZWN0KHNob3AuZ2V0QnlSb2xlKCdsaW5rJywgeyBuYW1lOiAvQWZmaWxpYXRlIGxpbmsvIH0pLmZpcnN0KCkpLnRvQmVWaXNpYmxlKCk7XG4gIGF3YWl0IGNoZWNrU2NyZWVuKHBhZ2UsICdzdGFydGVyLXBsYW4tc2hvcHBpbmcnKTtcbn0pO1xuXG50ZXN0KCdkZXNpZ24gZ2F0ZXMgcmVqZWN0IGtub3duIGRlZmVjdHMnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcbiAgYXdhaXQgcGFnZS5nb3RvKCcvJyk7XG4gIGF3YWl0IHBhZ2UuZXZhbHVhdGUoKCkgPT4ge1xuICAgIGNvbnN0IG1haW4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtYWluJyk7XG4gICAgbWFpbi5pbnNlcnRBZGphY2VudEhUTUwoJ2JlZm9yZWVuZCcsICc8aDE+U2Vjb25kIHRpdGxlPC9oMT48cCBzdHlsZT1cImZvbnQtc2l6ZToxMnB4XCI+VGlueSBjYXB0aW9uPC9wPjxwIHN0eWxlPVwiZm9udC1mYW1pbHk6R2VvcmdpYVwiPlNlcmlmIGNvcHk8L3A+PGJ1dHRvbiBzdHlsZT1cIm1pbi1oZWlnaHQ6MDtoZWlnaHQ6MzBweDtwYWRkaW5nOjAgOHB4XCI+U21hbGw8L2J1dHRvbj48ZGl2IHN0eWxlPVwid2lkdGg6MzAwMHB4O2hlaWdodDoxcHhcIj48L2Rpdj48cCBzdHlsZT1cImNvbG9yOiM5YWEzOWVcIj5GYWludCB0ZXh0PC9wPicpO1xuICB9KTtcbiAgY29uc3QgZGVzaWduID0gYXdhaXQgcGFnZS5ldmFsdWF0ZShtZWFzdXJlRGVzaWduKTtcbiAgZXhwZWN0KGRlc2lnbi5zbWFsbFRleHQubWFwKChlbnRyeSkgPT4gZW50cnkudGV4dCkpLnRvQ29udGFpbignVGlueSBjYXB0aW9uJyk7XG4gIGV4cGVjdChkZXNpZ24ub3RoZXJGYW1pbGllcykudG9Db250YWluKCdHZW9yZ2lhJyk7XG4gIGV4cGVjdChkZXNpZ24uaDEpLnRvQmUoMik7XG4gIGV4cGVjdChkZXNpZ24uc21hbGxUYXJnZXRzLm1hcCgodGFyZ2V0KSA9PiB0YXJnZXQubmFtZSkpLnRvQ29udGFpbignU21hbGwnKTtcbiAgZXhwZWN0KGRlc2lnbi5vdmVyZmxvdykudG9CZSh0cnVlKTtcbiAgYXdhaXQgcGFnZS5ldmFsdWF0ZShheGVTb3VyY2UpO1xuICBjb25zdCBpZHMgPSBhd2FpdCBwYWdlLmV2YWx1YXRlKGFzeW5jICgpID0+IChhd2FpdCB3aW5kb3cuYXhlLnJ1bihkb2N1bWVudCwgeyBydW5Pbmx5OiB7IHR5cGU6ICd0YWcnLCB2YWx1ZXM6IFsnd2NhZzJhYSddIH0gfSkpLnZpb2xhdGlvbnMubWFwKCh7IGlkIH0pID0+IGlkKSk7XG4gIGV4cGVjdChpZHMpLnRvQ29udGFpbignY29sb3ItY29udHJhc3QnKTtcbn0pO1xuIl0sIm1hcHBpbmdzIjoiQUFB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