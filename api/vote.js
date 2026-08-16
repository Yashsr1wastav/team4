// Vercel Serverless API: /api/vote
// Requires: install `@vercel/kv` and connect a Vercel KV instance to the project
// This handler uses a versioned key strategy so Reset (DELETE) does not need to enumerate voter keys.

export default async function handler(req, res) {
  // dynamic import so local dev can fail gracefully
  let kv;
  try { ({ kv } = await import('@vercel/kv')); } catch (err) {
    return res.status(500).json({ error: 'Vercel KV unavailable. Install @vercel/kv and set KV_REST_API_URL + KV_REST_API_TOKEN in Vercel.' });
  }

  const session = (req.query.session || '').toString();
  if (!session) return res.status(400).json({ error: 'Missing session query param' });

  // versioning key allows efficient reset: incrementing version moves to fresh keys
  const versionKey = `votes:${session}:version`;
  let version = parseInt(await kv.get(versionKey) || '1', 10);
  if (!version || isNaN(version)) version = 1;
  const posKey = `votes:${session}:v${version}:positive`;
  const negKey = `votes:${session}:v${version}:negative`;
  const voterId = req.headers['x-voter-id'] || req.query.voter || null;
  const votedKey = voterId ? `votes:${session}:v${version}:voted:${voterId}` : null;

  try {
    if (req.method === 'GET') {
      const [pos, neg, voted] = await Promise.all([kv.get(posKey), kv.get(negKey), votedKey ? kv.get(votedKey) : Promise.resolve(null)]);
      return res.json({ positive: Number(pos || 0), negative: Number(neg || 0), voted: !!voted, version });
    }

    if (req.method === 'POST') {
      const choice = (req.query.choice || '').toString();
      if (!voterId) return res.status(400).json({ error: 'Missing voter id header x-voter-id' });
      if (!['positive','negative'].includes(choice)) return res.status(400).json({ error: 'choice must be positive or negative' });

      const already = await kv.get(votedKey);
      if (already) return res.status(403).json({ error: 'Already voted' });

      // atomic increment for the choice
      const incKey = choice === 'positive' ? posKey : negKey;
      await kv.incr(incKey);
      // mark voter as having voted in this version
      await kv.set(votedKey, '1');

      const [pos, neg] = await Promise.all([kv.get(posKey), kv.get(negKey)]);
      return res.json({ positive: Number(pos || 0), negative: Number(neg || 0), voted: true, version });
    }

    if (req.method === 'DELETE') {
      // Reset round: bump version so new votes start fresh. This implicitly clears voter marks.
      const newVersion = await kv.incr(versionKey);
      // return zeros for the new version
      return res.json({ positive: 0, negative: 0, version: Number(newVersion) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}
