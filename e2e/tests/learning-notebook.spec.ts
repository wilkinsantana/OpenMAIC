import { test, expect } from '@playwright/test';

const courseId = 'notebook-browser-test';
async function seed(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(async (id) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('maic-documents', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('stages', { keyPath: 'id' });
        const scenes = db.createObjectStore('scenes', { keyPath: ['stageId', 'id'] });
        scenes.createIndex('by-stage', 'stageId');
        db.createObjectStore('outlines', { keyPath: 'stageId' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['stages', 'scenes', 'outlines'], 'readwrite');
        const now = Date.now();
        tx.objectStore('stages').put({
          id,
          name: 'Notebook testing course',
          description: '',
          style: 'professional',
          createdAt: now,
          updatedAt: now,
          dslVersion: '0.1.0',
        });
        for (const [order, sceneId] of ['first', 'second'].entries()) {
          tx.objectStore('scenes').put({
            id: sceneId,
            stageId: id,
            type: 'interactive',
            title: sceneId === 'first' ? 'First lesson' : 'Second lesson',
            order,
            createdAt: now,
            updatedAt: now,
            actions: [],
            content: {
              type: 'interactive',
              url: '',
              html: '<html><body><h1>A test lesson</h1></body></html>',
            },
          });
        }
        tx.objectStore('outlines').put({
          stageId: id,
          outline: { outlines: [], createdAt: now, updatedAt: now },
        });
        localStorage.setItem(
          `maic:device:editor-current-scene:${id}`,
          JSON.stringify({ sceneId: 'first', updatedAt: new Date(now).toISOString() }),
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, courseId);
  await page.goto(`/classroom/${courseId}`);
}

test('personal notes autosave, filter, navigate and export separately from the course', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const panel = page.getByTestId('learning-notebook');
  const editor = panel.getByLabel('Your notes (Markdown)');
  await editor.fill('Remember **request cancellation** and inspect the logs.');
  await expect(panel.getByRole('status')).toHaveText('Saved in this browser');
  await panel.getByRole('button', { name: 'Bookmark', exact: true }).click();
  await panel.getByRole('button', { name: 'Review later', exact: true }).first().click();
  await expect(panel.getByRole('status')).toHaveText('Saved in this browser');
  await page.reload();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(editor).toHaveValue('Remember **request cancellation** and inspect the logs.');
  await expect(panel.getByRole('button', { name: 'Bookmark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(
    panel.locator('section[aria-label]').last().getByRole('list').getByRole('button'),
  ).toHaveCount(1);
  await panel.getByRole('button', { name: 'Go to slide', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.format).toBe('openmaic-personal-notebook');
  expect(backup.notes[0].text).toContain('request cancellation');
  // Import a second target plus an existing note: existing text must survive.
  const imported = {
    ...backup,
    notes: [
      { ...backup.notes[0], text: 'Must not overwrite my note' },
      {
        ...backup.notes[0],
        sceneId: 'second',
        sceneTitle: 'Second lesson',
        text: 'Imported second lesson',
      },
    ],
  };
  await panel.locator('input[type=file]').setInputFiles({
    name: 'notebook.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(
    panel.locator('section[aria-label]').last().getByRole('list').getByRole('button'),
  ).toHaveCount(2);
  await expect(editor).toHaveValue('Remember **request cancellation** and inspect the logs.');
  await panel
    .getByRole('list')
    .getByRole('button', { name: /Second lesson/ })
    .click();
  await expect(editor).toHaveValue('Imported second lesson');
  await panel.getByRole('button', { name: 'Go to slide', exact: true }).click();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Second lesson', exact: true })).toBeVisible();
  await panel
    .getByRole('list')
    .getByRole('button', { name: /First lesson/ })
    .click();
  await panel.getByRole('button', { name: 'Go to slide', exact: true }).click();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'First lesson', exact: true })).toBeVisible();
  await panel.getByLabel('Search notes and slide titles').fill('not present');
  await expect(panel.getByText('No notes match this view.')).toBeVisible();
  await panel.getByLabel('Search notes and slide titles').fill('');
  await page.screenshot({ path: '/tmp/openmaic-notebook-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/openmaic-notebook-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('code exercise fills the classroom slot and places its number in the toolbar', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('maic-documents', 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('scenes', 'readwrite');
      const store = tx.objectStore('scenes');
      const request = store.get([id, 'first']);
      request.onsuccess = () => {
        const scene = request.result;
        scene.content.html = `<html><body><header><h2>Responsive exercise</h2><div><button id="hint-btn">Hint</button><button id="solution-toggle-btn">Show Solution</button><button id="run-btn">Run</button><button id="reset-btn">Reset</button></div></header><textarea id="code-input">Attempt</textarea><script id="widget-config" type="application/json">{"type":"code","hints":[],"solution":"Answer"}</script></body></html>`;
        store.put(scene);
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }, courseId);
  await page.reload();
  const iframe = page.locator('iframe').filter({ visible: true }).first();
  const frame = iframe.contentFrame();
  await expect(frame.locator('[data-maic-scene-number]')).toHaveText('01');
  await expect(frame.locator('#reset-btn + #run-btn + select')).toHaveAttribute(
    'aria-label',
    'Exercise progress',
  );
  await expect(frame.locator('[data-maic-exercise-toolbar] > :last-child')).toHaveAttribute(
    'data-maic-scene-number',
    '',
  );
  for (const size of [
    { width: 1440, height: 1100 },
    { width: 800, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        const bounds = await iframe.boundingBox();
        const viewport = await frame
          .locator('html')
          .evaluate(() => ({ width: innerWidth, height: innerHeight }));
        return bounds
          ? Math.abs(bounds.width - viewport.width) + Math.abs(bounds.height - viewport.height)
          : 999;
      })
      .toBeLessThan(3);
    await expect
      .poll(async () => iframe.evaluate((el) => el.getBoundingClientRect().height))
      .toBeGreaterThan(size.height * 0.6);
  }
  await frame.locator('#code-input').fill('My persistent solution');
  await expect(frame.getByRole('status')).toContainText('Attempt saved');
  await page.reload();
  await expect(frame.locator('#code-input')).toHaveValue('My persistent solution');
  await frame.getByRole('button', { name: 'Apply solution', exact: true }).click();
  await expect(frame.getByRole('status')).toContainText('Solution-assisted');
  await page.reload();
  await expect(frame.locator('#code-input')).toHaveValue('Answer');
  await frame.getByRole('button', { name: 'Restore my attempt', exact: true }).click();
  await expect(frame.locator('#code-input')).toHaveValue('My persistent solution');
  await frame.getByLabel('Exercise progress').selectOption('completed');
  await expect(frame.getByRole('status')).toContainText('Attempt saved');
  await page.screenshot({ path: '/tmp/openmaic-responsive-classroom.png', fullPage: true });
});

test('course tools save a narrator voice and append a module without replacing lessons', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const panel = page.getByTestId('learning-notebook');
  await panel.getByText('Course narration voice', { exact: true }).click();
  await panel.getByLabel('Kokoro voice', { exact: true }).selectOption('am_adam');
  await panel.getByRole('button', { name: 'Save course voice', exact: true }).click();
  await expect(
    panel.getByText('Course voice saved. Existing narration is unchanged until regenerated.'),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await panel.getByText('Course narration voice', { exact: true }).click();
  await expect(panel.getByLabel('Kokoro voice', { exact: true })).toHaveValue('am_adam');
  const titles: string[] = [];
  await page.route('**/api/generate/scene-content', async (route) => {
    const body = route.request().postDataJSON();
    titles.push(body.outline.title);
    await route.fulfill({
      json: {
        success: true,
        content: {
          type: 'interactive',
          html: '<html><body>New module lesson</body></html>',
          url: '',
        },
      },
    });
  });
  await page.route('**/api/generate/scene-actions', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        success: true,
        scene: {
          id: body.outline.id,
          stageId: body.stageId,
          type: 'interactive',
          title: body.outline.title,
          order: body.outline.order,
          content: body.content,
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    });
  });
  await panel.getByText('Add a course module', { exact: true }).click();
  await panel.getByLabel('Module level', { exact: true }).selectOption('Advanced');
  await panel
    .getByLabel('Lesson topics (one per line)')
    .fill('Debugging concurrency\nReviewing generated code');
  await panel.getByRole('button', { name: 'Generate and append module', exact: true }).click();
  await expect.poll(() => titles.length).toBe(2);
  await expect(
    panel.getByText(
      'Generation finished or paused. Check the lesson list for results and any failed pages.',
    ),
  ).toBeVisible();
  const saved = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('maic-documents', 1);
      r.onsuccess = () => resolve(r.result);
    });
    const result = await new Promise<any[]>((resolve) => {
      const r = db.transaction('scenes').objectStore('scenes').index('by-stage').getAll(id);
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return result.map((s) => s.title);
  }, courseId);
  expect(saved).toEqual(
    expect.arrayContaining([
      'First lesson',
      'Second lesson',
      'Advanced: Debugging concurrency',
      'Advanced: Reviewing generated code',
    ]),
  );
  expect(saved).toHaveLength(4);
  await page.screenshot({ path: '/tmp/openmaic-course-tools.png', fullPage: true });
});

test('page arrows navigate in playback and inside lessons, but preserve note editing', async ({
  page,
}) => {
  await seed(page);
  await page.getByRole('heading', { name: 'First lesson', exact: true, level: 1 }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Second lesson', exact: true })).toBeVisible();
  await page.frameLocator('iframe[title="Interactive Scene second"]').locator('h1').click();
  await page.keyboard.press('ArrowLeft');
  await expect(
    page.getByRole('heading', { name: 'First lesson', exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await page.getByLabel('Your notes (Markdown)').fill('Keep my cursor here');
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('heading', { name: 'First lesson', exact: true, level: 1 }),
  ).toBeVisible();
});
