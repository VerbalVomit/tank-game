// Keep winner selection in one small server-side function so it can be checked independently.
function chooseWinners(players, reason) {
  // A last-player result excludes eliminated pilots; a timer result compares the whole roster.
  const candidates = reason === 'last-player'
    ? players.filter(player => player.lives > 0 && !player.left)
    : players.filter(player => !player.left);
  if (!candidates.length) return [];
  const bestKills = Math.max(...candidates.map(player => player.kills));
  const mostKills = candidates.filter(player => player.kills === bestKills);
  // Kills break the first tie, remaining lives break the next, and any final tie shares the win.
  const bestLives = Math.max(...mostKills.map(player => player.lives));
  return mostKills
    .filter(player => player.lives === bestLives)
    .map(player => ({ id: player.id, name: player.name }));
}

module.exports = { chooseWinners };
