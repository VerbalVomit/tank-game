function chooseWinners(players, reason) {
  const candidates = reason === 'last-player'
    ? players.filter(player => player.lives > 0 && !player.left)
    : players.filter(player => !player.left);
  if (!candidates.length) return [];
  const bestKills = Math.max(...candidates.map(player => player.kills));
  const mostKills = candidates.filter(player => player.kills === bestKills);
  const bestLives = Math.max(...mostKills.map(player => player.lives));
  return mostKills
    .filter(player => player.lives === bestLives)
    .map(player => ({ id: player.id, name: player.name }));
}

module.exports = { chooseWinners };
