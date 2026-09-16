const assert = require('node:assert/strict');
const { test } = require('node:test');
require('../synthesis.js');
const { createVoice, createNoiseBuffer } = globalThis.HarmonicsSynthesis;

function audioContext(sampleRate = 48000) {
  const nodes = [];
  function param() {
    return { value: 0, setTargetAtTime(value, time, duration) { this.value = value; this.ramp = [time, duration]; } };
  }
  function node(type) {
    const result = { type, gain: param(), frequency: param(), pan: param(), connections: [],
      connect(target) { this.connections.push(target); return target; },
      disconnect() { this.connections = []; this.disconnected = true; },
      start() { this.started = true; }, stop() { this.stops = (this.stops || 0) + 1; } };
    nodes.push(result); return result;
  }
  return { sampleRate, currentTime: 2, nodes,
    createGain: () => node('gain'), createStereoPanner: () => node('pan'), createOscillator: () => node('oscillator'),
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => data };
    } };
}

test('313 pitch, stereo separation, octave partials, retuning, and full cleanup', () => {
  const context = audioContext();
  const voice = createVoice(context, {}, { carrier: 313 / 8, pulse: 8, mode: 'binaural', shape: 'sine', harmonicGain: .28 });
  const oscillators = context.nodes.filter(node => node.started);
  assert.deepEqual(oscillators.map(node => node.frequency.value), [35.125, 70.25, 43.125, 86.25]);
  assert.deepEqual(context.nodes.filter(node => node.type === 'pan').map(node => node.pan.value), [-1, 1]);
  assert.equal(voice.level.gain.value, 0);
  voice.retune(100);
  assert.deepEqual(oscillators.map(node => node.frequency.value), [96, 192, 104, 208]);
  assert.deepEqual(oscillators[0].frequency.ramp, [2, .12]);
  voice.dispose(); voice.dispose();
  assert.ok(oscillators.every(node => node.stops === 1));
  assert.ok(context.nodes.every(node => node.disconnected));
});

test('speaker mode uses identical carriers and a separate volume oscillator', () => {
  const context = audioContext();
  createVoice(context, {}, { carrier: 220, pulse: 6, mode: 'isochronic', shape: 'triangle', harmonicGain: 0 });
  const oscillators = context.nodes.filter(node => node.started);
  assert.deepEqual(oscillators.map(node => node.frequency.value), [220, 220, 6]);
  assert.deepEqual(context.nodes.filter(node => node.type === 'pan').map(node => node.pan.value), [0, 0]);
  assert.equal(oscillators[2].type, 'sine');
});

function seededRandom() {
  let seed = 1973;
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

test('generated loops are finite, centered, bounded, and spectrally distinct at both sample rates', () => {
  for (const rate of [44100, 48000]) {
    const context = audioContext(rate), changes = {};
    for (const kind of ['pink', 'brown']) {
      const buffer = createNoiseBuffer(context, kind, seededRandom());
      const data = buffer.getChannelData(0);
      assert.equal(buffer.length, rate * 5);
      assert.equal(buffer.numberOfChannels, 1);
      let total = 0, energy = 0, difference = 0, peak = 0;
      for (let i = 0; i < data.length; i++) {
        assert.ok(Number.isFinite(data[i]));
        total += data[i]; energy += data[i] ** 2; peak = Math.max(peak, Math.abs(data[i]));
        difference += (data[i] - data[(i + 1) % data.length]) ** 2;
      }
      assert.ok(Math.abs(total / data.length) < 1e-6, 'No DC offset');
      assert.ok(Math.abs(Math.sqrt(energy / data.length) - .12) < .001, 'Predictable level');
      assert.ok(peak <= .95);
      changes[kind] = difference / data.length;
      assert.ok(Math.abs(data[0] - data.at(-1)) < Math.sqrt(changes[kind]) * 6, 'No exceptional loop-boundary jump');
    }
    assert.ok(changes.brown < changes.pink / 4, 'Rumble has less high-frequency energy than hiss');
    assert.throws(() => createNoiseBuffer(context, 'unsupported'), RangeError);
  }
});
