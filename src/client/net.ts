/** Thin typed client for the /api endpoints. */
import type {
  PlaceRequest,
  PlaceResponse,
  RunResponse,
  StateResponse,
  VoteResponse,
} from '../shared/api';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (data === null) throw new Error(`POST ${url} -> ${res.status}`);
  return data;
}

export const net = {
  state: () => getJson<StateResponse>('/api/state'),
  run: (date: string) => getJson<RunResponse>(`/api/run/${date}`),
  preview: () => getJson<RunResponse>('/api/preview'),
  place: (req: PlaceRequest) => postJson<PlaceResponse>('/api/place', req),
  vote: (c: number, r: number, dir: 1 | -1) =>
    postJson<VoteResponse>('/api/vote', { c, r, dir }),
  watched: (date: string) => postJson<{ ok: boolean }>('/api/watched', { date }),
};
