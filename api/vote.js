// Vercel Serverless API: /api/vote
// Requires: @vercel/kv installed and a KV/Redis store connected to this project.
// Uses a versioned key strategy so Reset (DELETE) doesn't need to delete data —
// it just bumps a version number, and all reads/writes use `session:version` as
// the key, so old votes become orphaned instead of requiring a destructive wipe.
import { config } from 'dotenv';
config({ path: '.env.local' });
export default async function handler(req, res) {
  // dynamic import so local dev without KV configured fails gracefully,
  // instead of crashing the whole function at import time
  console.log('DEBUG all env keys containing KV:', Object.keys(process.env).filter(k => k.toUpperCase().includes('KV')));
  let kv;
  try {
    ({ kv } = await import('@vercel/kv'));
  } catch (err) {
    return res.status(500).json({ error: 'Vercel KV unavailable. Install @vercel/kv and connect a store.' });
  }

  const session = (req.query.session || '').toString();
  if (!session) return res.status(400).json({ error: 'Missing session query param' });

  const versionKey = `version:${session}`;

  try {
    // ---------- GET: return current tally ----------
    if (req.method === 'GET') {
      const version = (await kv.get(versionKey)) || 0;
      const votesKey = `votes:${session}:${version}`;
      const tally = (await kv.hgetall(votesKey)) || {};
      return res.status(200).json({
        positive: Number(tally.positive || 0),
        negative: Number(tally.negative || 0),
        version,
      });
    }

    // ---------- POST: cast a vote ----------
    if (req.method === 'POST') {
      const choice = (req.query.choice || '').toString();
      const voterId = (req.query.voterId || '').toString();
      if (!['positive', 'negative'].includes(choice)) {
        return res.status(400).json({ error: 'choice must be "positive" or "negative"' });
      }
      if (!voterId) return res.status(400).json({ error: 'Missing voterId query param' });

      const version = (await kv.get(versionKey)) || 0;
      const votersKey = `voters:${session}:${version}`;
      const votesKey = `votes:${session}:${version}`;

      const alreadyVoted = await kv.sismember(votersKey, voterId);
      if (alreadyVoted) {
        const tally = (await kv.hgetall(votesKey)) || {};
        return res.status(409).json({
          error: 'Already voted this round',
          positive: Number(tally.positive || 0),
          negative: Number(tally.negative || 0),
        });
      }

      await kv.sadd(votersKey, voterId);
      await kv.hincrby(votesKey, choice, 1);

      const tally = await kv.hgetall(votesKey);
      return res.status(200).json({
        positive: Number(tally.positive || 0),
        negative: Number(tally.negative || 0),
        version,
      });
    }

    // ---------- DELETE: reset the round (presenter only) ----------
    if (req.method === 'DELETE') {
      const version = (await kv.get(versionKey)) || 0;
      await kv.set(versionKey, version + 1);
      return res.status(200).json({ ok: true, version: version + 1 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'KV operation failed', detail: String(err) });
  }
}