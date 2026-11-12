const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseWinners } = require('../game-rules');

test('timer scoring uses kills, then remaining lives, and preserves full ties', () => {
  const players = [
    { id: 'a', name: 'A', kills: 4, lives: 1, left: false },
    { id: 'b', name: 'B', kills: 4, lives: 2, left: false },
    { id: 'c', name: 'C', kills: 3, lives: 3, left: false },
    { id: 'd', name: 'D', kills: 4, lives: 2, left: false }
  ];
  assert.deepEqual(chooseWinners(players, 'time'), [{ id: 'b', name: 'B' }, { id: 'd', name: 'D' }]);
});

test('last-player scoring only selects living players', () => {
  const players = [
    { id: 'a', name: 'A', kills: 8, lives: 0, left: false },
    { id: 'b', name: 'B', kills: 1, lives: 1, left: false },
    { id: 'c', name: 'C', kills: 9, lives: 2, left: true }
  ];
  assert.deepEqual(chooseWinners(players, 'last-player'), [{ id: 'b', name: 'B' }]);
});

test('time scoring excludes players who quit or disconnected', () => {
  const players = [
    { id: 'a', name: 'A', kills: 0, lives: 3, left: false },
    { id: 'b', name: 'B', kills: 9, lives: 2, left: true }
  ];
  assert.deepEqual(chooseWinners(players, 'time'), [{ id: 'a', name: 'A' }]);
  assert.deepEqual(chooseWinners(players.filter(player => player.left), 'time'), []);
});
