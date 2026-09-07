import { test, expect } from '@playwright/test';
test('fresh browser recovers server course, notebook, and attempts', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.E2E_PERSISTENCE_TOKEN,
    'Requires an isolated persistence-enabled deployment',
  );
  const first = await browser.newContext();
  const headers = {
    authorization: `Bearer ${process.env.E2E_PERSISTENCE_TOKEN}`,
    'x-learner-key': 'before-clear',
  };
  const created = await first.request.post(`${baseURL}/api/stages`, {
    data: { name: 'Durability test' },
  });
  expect(created.ok()).toBe(true);
  const { stage } = await created.json();
  const now = Date.now();
  const note = {
    courseId: stage.id,
    sceneId: 'first',
    courseTitle: 'Test',
    sceneTitle: 'First',
    excerpt: '',
    text: 'Keep this note',
    bookmarked: true,
    reviewLater: true,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  expect(
    (
      await first.request.post(`${baseURL}/api/learning-storage?kind=note`, {
        headers,
        data: { record: note, expectedRevision: 0 },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await first.request.post(`${baseURL}/api/learning-storage?kind=note`, {
        headers,
        data: { record: { ...note, revision: 2 }, expectedRevision: 0 },
      })
    ).status(),
  ).toBe(409);
  const attempt = {
    courseId: stage.id,
    sceneId: 'first',
    sourceHash: 'test',
    courseTitle: 'Test',
    sceneTitle: 'First',
    code: 'my attempt',
    savedAttempt: 'before solution',
    assisted: true,
    status: 'needs-review',
    updatedAt: now,
  };
  expect(
    (
      await first.request.post(`${baseURL}/api/learning-storage?kind=attempt`, {
        headers,
        data: { record: attempt, expectedRevision: 0 },
      })
    ).ok(),
  ).toBe(true);
  const audioBytes = Buffer.from('durable audio fixture');
  const uploaded = await first.request.post(`${baseURL}/api/persistence/assets`, {
    headers,
    multipart: {
      meta: { name: 'metadata.json', mimeType: 'application/json', buffer: Buffer.from('{}') },
      bytes: { name: 'asset', mimeType: 'audio/wav', buffer: audioBytes },
    },
  });
  expect(uploaded.status()).toBe(201);
  const { id: assetRef } = await uploaded.json();
  const audio = {
    id: `${stage.id}-speech`,
    stageId: stage.id,
    courseId: stage.id,
    assetRef,
    updatedAt: now,
  };
  expect(
    (
      await first.request.post(`${baseURL}/api/learning-storage?kind=audio`, {
        headers,
        data: { record: audio, expectedRevision: 0 },
      })
    ).ok(),
  ).toBe(true);
  await first.close();
  const fresh = await browser.newContext();
  const library = await (await fresh.request.get(`${baseURL}/api/stages`)).json();
  expect(library.stages.some((row: { id: string }) => row.id === stage.id)).toBe(true);
  for (const kind of ['note', 'attempt', 'audio']) {
    const records = await (
      await fresh.request.get(`${baseURL}/api/learning-storage?kind=${kind}`, {
        headers: { ...headers, 'x-learner-key': 'after-clear' },
      })
    ).json();
    expect(records).toContainEqual(kind === 'note' ? note : kind === 'attempt' ? attempt : audio);
  }
  const recoveredBytes = await fresh.request.get(
    `${baseURL}/api/persistence/assets/${encodeURIComponent(assetRef)}/content`,
    { headers },
  );
  expect(recoveredBytes.ok()).toBe(true);
  expect(await recoveredBytes.body()).toEqual(audioBytes);
  await fresh.close();
});
