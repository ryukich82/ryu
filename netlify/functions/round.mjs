import { getStore } from '@netlify/blobs';
import { createApi, handle } from '../lib/core.mjs';

export default async (req) => {
  const blobs = getStore({ name: 'golf-rounds', consistency: 'strong' });
  const api = createApi({
    get: key => blobs.get(key, { type: 'json' }),
    set: (key, value) => blobs.setJSON(key, value),
  });
  return handle(api, req);
};

export const config = { path: ['/api/round', '/api/round/*'] };
