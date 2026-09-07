import { NextRequest, NextResponse } from 'next/server';
import { authenticatePersistenceHeaders } from '@/lib/persistence/server-auth';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
export const runtime = 'nodejs';
async function context(req: NextRequest) {
  if (!process.env.DATABASE_URL) throw new Error('disabled');
  const principal = authenticatePersistenceHeaders(req.headers);
  if (!principal?.learnerKey) throw new Error('unauthorized');
  const kind = req.nextUrl.searchParams.get('kind');
  if (!['note', 'attempt', 'visit', 'audio', 'media'].includes(kind || ''))
    throw new Error('invalid');
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL);
  await pool.query(
    'CREATE TABLE IF NOT EXISTS local_learning_records (learner text NOT NULL, kind text NOT NULL, key text NOT NULL, payload jsonb NOT NULL, revision bigint NOT NULL, PRIMARY KEY(learner,kind,key))',
  );
  return { pool, learner: principal.learnerKey, kind };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return NextResponse.json(
    { error: 'Storage request failed' },
    {
      status:
        message === 'unauthorized'
          ? 401
          : message === 'disabled'
            ? 404
            : message === 'invalid'
              ? 400
              : 503,
    },
  );
}
export async function GET(req: NextRequest) {
  try {
    const { pool, learner, kind } = await context(req);
    const key = req.nextUrl.searchParams.get('key');
    const result = key
      ? await pool.query(
          'SELECT payload FROM local_learning_records WHERE learner=$1 AND kind=$2 AND key=$3',
          [learner, kind, key],
        )
      : await pool.query(
          'SELECT payload FROM local_learning_records WHERE learner=$1 AND kind=$2',
          [learner, kind],
        );
    return NextResponse.json(
      key ? (result.rows[0]?.payload ?? null) : result.rows.map((row) => row.payload),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { pool, learner, kind } = await context(req);
    const text = await req.text();
    if (text.length > 500000) throw new Error('invalid');
    const { record, expectedRevision } = JSON.parse(text);
    if (
      !record ||
      typeof record !== 'object' ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0
    )
      throw new Error('invalid');
    for (const field of [
      'courseId',
      ...(['visit', 'audio', 'media'].includes(kind || '') ? [] : ['sceneId']),
      ...(kind === 'attempt' ? ['sourceHash'] : []),
    ])
      if (typeof record[field] !== 'string' || !record[field] || record[field].length > 2000)
        throw new Error('invalid');
    if (
      kind === 'note' &&
      (typeof record.text !== 'string' ||
        typeof record.bookmarked !== 'boolean' ||
        typeof record.reviewLater !== 'boolean')
    )
      throw new Error('invalid');
    if (
      kind === 'attempt' &&
      (typeof record.code !== 'string' ||
        !(record.savedAttempt === null || typeof record.savedAttempt === 'string') ||
        typeof record.assisted !== 'boolean' ||
        !['in-progress', 'completed', 'needs-review'].includes(record.status))
    )
      throw new Error('invalid');
    if (
      ['audio', 'media'].includes(kind || '') &&
      (typeof record.id !== 'string' || typeof record.assetRef !== 'string')
    )
      throw new Error('invalid');
    const revision = kind === 'note' ? record.revision : record.updatedAt;
    if (!Number.isSafeInteger(revision) || revision <= expectedRevision) throw new Error('invalid');
    const key = ['audio', 'media'].includes(kind || '')
      ? record.id
      : kind === 'visit'
        ? record.courseId
        : JSON.stringify([
            record.courseId,
            record.sceneId,
            ...(kind === 'attempt' ? [record.sourceHash] : []),
          ]);
    const result = await pool.query(
      `INSERT INTO local_learning_records(learner,kind,key,payload,revision) SELECT $1,$2,$3,$4,$5 WHERE $6::bigint=0 OR EXISTS(SELECT 1 FROM local_learning_records WHERE learner=$1 AND kind=$2 AND key=$3) ON CONFLICT(learner,kind,key) DO UPDATE SET payload=EXCLUDED.payload,revision=EXCLUDED.revision WHERE local_learning_records.revision=$6 RETURNING revision`,
      [learner, kind, key, record, revision, expectedRevision],
    );
    if (!result.rowCount) return NextResponse.json({ error: 'Conflict' }, { status: 409 });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}
