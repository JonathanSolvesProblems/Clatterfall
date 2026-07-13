import { describe, expect, it } from 'vitest';
import { topContributors } from './contributors';
import { HOUSE_OWNER } from '../../shared/constants';

const cells = [
  { c: 1, r: 2, owner: 'alice' },
  { c: 2, r: 3, owner: 'bob' },
  { c: 3, r: 4, owner: 'alice' },
  { c: 4, r: 5, owner: HOUSE_OWNER },
  { c: 5, r: 6, owner: 'carol' },
  { c: 6, r: 7, owner: 'dave' },
];

describe('topContributors', () => {
  it('sums a redditor across all of their parts', () => {
    const top = topContributors(cells, { '1:2': 100, '3:4': 50, '2:3': 120 });
    // alice placed two parts (100 + 50 = 150), so she outranks bob's single 120.
    expect(top[0]).toEqual({ name: 'alice', px: 150 });
    expect(top[1]).toEqual({ name: 'bob', px: 120 });
  });

  it('never lists the house seed account', () => {
    const top = topContributors(cells, { '4:5': 9999, '1:2': 10 });
    expect(top.map((t) => t.name)).toEqual(['alice']);
  });

  it('caps the board and breaks ties deterministically', () => {
    const top = topContributors(cells, { '2:3': 50, '5:6': 50, '6:7': 50, '1:2': 50 });
    expect(top).toHaveLength(3); // dave is cut
    expect(top.map((t) => t.name)).toEqual(['alice', 'bob', 'carol']); // equal px -> by name
  });

  it('drops parts that carried the marble nowhere', () => {
    const top = topContributors(cells, { '1:2': 0, '2:3': 40 });
    expect(top.map((t) => t.name)).toEqual(['bob']);
  });
});
