import {
  getPersistenceRequestHeaders,
  isBrowserPersistenceEnabled,
} from '@/lib/persistence/bootstrap';
export const usesServerLearningStorage = isBrowserPersistenceEnabled;
export async function learningRequest(
  kind: 'note' | 'attempt' | 'visit' | 'audio' | 'media',
  key?: string,
  body?: unknown,
) {
  const query = new URLSearchParams({ kind, ...(key ? { key } : {}) });
  const response = await fetch(`/api/learning-storage?${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(await getPersistenceRequestHeaders()), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(
      response.status === 409 ? 'Saved work changed in another tab' : 'Server save unavailable',
    );
  return response.json();
}
