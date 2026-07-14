/** Wire DTOs shared by the client and server (the /api contract). */
import type { CliffhangerState, CollisionEvent, Contributor, Keyframe, PartId } from './types';

/** A placed part as sent to the client (owner + decay flag, no timestamps). */
export type WireCell = {
  c: number;
  r: number;
  part: PartId;
  orient: string;
  owner: string;
  decaying?: boolean;
};

export type UserPanel = {
  username: string;
  placedToday: boolean;
  streak: number;
  longestStreak: number;
  lifetimePx: number;
  bestPartPx: number;
  yourCells: string[]; // cellIds this user placed (and still standing)
};

/** GET /api/state: everything the Build scene needs to render + play. */
export type StateResponse = {
  type: 'state';
  postId: string;
  season: number;
  day: number;
  cells: WireCell[];
  frontier: string[]; // buildable cellIds today
  deepestRow: number;
  reach: number; // latest run's reach (logical px)
  record: number;
  goal: number;
  latestRunDate: string | null;
  hasNewRunForUser: boolean; // client should auto-play the latest run
  nextRunAtMs: number;
  serverNowMs: number;
  builders: number; // distinct redditors who have placed a standing part
  /** Lifetime ledger. placed - dissolved === parts still standing. */
  ledger: { placed: number; dissolved: number };
  /** Standing parts the marble actually touched last run (i.e. load-bearing). */
  carrying: number;
  lastContributions: Record<string, number>; // cellId -> +px from the latest run
  /** Decimated path of the last run, so the board can trace how the marble threaded the machine. */
  lastPath: { x: number; y: number }[];
  /** Show the mod-only "remove part" tool. Always re-checked server-side on use. */
  isMod?: boolean;
  user: UserPanel;
};

export type RemoveRequest = { c: number; r: number };
export type RemoveResponse = { ok: boolean; message: string };

export type PlaceRequest = { c: number; r: number; part: PartId; orient: string };

export type PlaceReject =
  | 'occupied'
  | 'not_frontier'
  | 'already_placed'
  | 'locked'
  | 'invalid'
  | 'no_user';

export type PlaceResponse =
  | { ok: true; cell: WireCell; frontier: string[]; streak: number }
  | { ok: false; reason: PlaceReject; message: string };

export type VoteRequest = { c: number; r: number; dir: 1 | -1 };
/** `applied` is false when this user had already voted on this part. */
export type VoteResponse = { ok: boolean; up: number; down: number; applied?: boolean };

/** GET /api/run/:date: the authoritative replay payload. */
export type RunResponse = {
  type: 'run';
  date: string;
  season: number;
  day: number;
  keyframes: Keyframe[];
  events: CollisionEvent[];
  reach: number;
  prevRecord: number;
  record: number;
  goal: number;
  state: CliffhangerState;
  quiet: boolean;
  contributions: Record<string, number>;
  cappingCell: string;
  topContributors: Contributor[]; // who carried it furthest today (max 3)
  dissolved: number; // parts the marble ABANDONED, removed before this run
  jammedOwner: string; // owner of the part the marble got STUCK on ('' if none)
  cells: WireCell[]; // the machine as it stood for this run
};

export type ErrorResponse = { status: 'error'; message: string };
