import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS } from './tracks';
import {
  computeBallPoseAtTime,
  computeMultiplier,
  computeStars,
  evaluateTileLanding,
  generateTrackTiles,
  getBeatDuration,
  getTileXAtTime,
  Z_STEP_PER_BEAT,
} from './beatEngine';

test('generateTrackTiles creates opening safe tiles centered at x=0', () => {
  for (const track of TRACKS) {
    const tiles = generateTrackTiles(track);
    assert.equal(tiles.length, track.totalBeats + 1);
    for (let i = 0; i <= 3; i++) {
      assert.equal(tiles[i].baseX, 0, `${track.id} tile ${i} should be centered`);
      assert.equal(tiles[i].isMoving, false, `${track.id} intro tile ${i} should be static`);
      assert.ok(tiles[i].width >= 2.4, 'intro tiles must be extra wide');
    }
  }
});

test('generateTrackTiles keeps all tile centers inside corridor bounds', () => {
  for (const track of TRACKS) {
    const tiles = generateTrackTiles(track);
    for (const tile of tiles) {
      const minX = getTileXAtTime(tile, tile.beatTime) - tile.width * 0.5;
      const maxX = getTileXAtTime(tile, tile.beatTime) + tile.width * 0.5;
      assert.ok(minX >= -3.3 && maxX <= 3.3, `Tile ${tile.index} out of corridor bounds`);
    }
  }
});

test('computeBallPoseAtTime lands at y=0 on every beat and peaks at half-beat', () => {
  const bpm = 120;
  const beatDur = getBeatDuration(bpm);
  assert.equal(beatDur, 0.5);

  const beat0 = computeBallPoseAtTime(0, bpm);
  assert.equal(beat0.y, 0);
  assert.equal(beat0.z, 0);

  const halfBeat = computeBallPoseAtTime(beatDur * 0.5, bpm);
  assert.ok(Math.abs(halfBeat.y - 2.15) < 1e-6);
  assert.ok(Math.abs(halfBeat.z - -0.5 * Z_STEP_PER_BEAT) < 1e-6);

  const beat4 = computeBallPoseAtTime(beatDur * 4, bpm);
  assert.ok(beat4.y < 1e-6);
  assert.equal(beat4.beatIndex, 4);
  assert.ok(Math.abs(beat4.z - -4 * Z_STEP_PER_BEAT) < 1e-6);
});

test('evaluateTileLanding distinguishes perfect, good, miss, and gem collection', () => {
  const tiles = generateTrackTiles(TRACKS[0]);
  const sampleTile = {
    ...tiles[5],
    baseX: 1.0,
    isMoving: false,
    hasGem: true,
    gemOffsetX: 0.25,
    gemCollected: false,
  };

  const perfect = evaluateTileLanding(1.05, sampleTile, sampleTile.beatTime, 2, 2);
  assert.equal(perfect.judgment, 'perfect');
  assert.equal(perfect.nextCombo, 3);
  assert.equal(perfect.nextPerfectStreak, 3);
  assert.equal(perfect.multiplier, 2);
  assert.equal(perfect.gemCollected, true);
  assert.equal(perfect.pointsAwarded, 2 * 2 + 5);

  const good = evaluateTileLanding(1.95, sampleTile, sampleTile.beatTime, 4, 5);
  assert.equal(good.judgment, 'good');
  assert.equal(good.nextCombo, 5);
  assert.equal(good.nextPerfectStreak, 0);
  assert.equal(good.multiplier, 1);

  const miss = evaluateTileLanding(-1.5, sampleTile, sampleTile.beatTime, 5, 4);
  assert.equal(miss.judgment, 'miss');
  assert.equal(miss.nextCombo, 0);
  assert.equal(miss.pointsAwarded, 0);
});

test('computeMultiplier and computeStars scale accurately at thresholds', () => {
  assert.equal(computeMultiplier(0), 1);
  assert.equal(computeMultiplier(3), 2);
  assert.equal(computeMultiplier(6), 3);
  assert.equal(computeMultiplier(12), 4);

  assert.equal(computeStars(0.2), 0);
  assert.equal(computeStars(0.33), 1);
  assert.equal(computeStars(0.66), 2);
  assert.equal(computeStars(1.0), 3);
});
