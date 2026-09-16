/* Local synthesis only: browser oscillators and generated random samples. */
(() => {
  "use strict";

  function createVoice(context, destination, options) {
    const nodes = [], generators = [], pitched = [];
    const track = node => { nodes.push(node); return node; };
    const level = track(context.createGain());
    const envelope = track(context.createGain());
    level.gain.value = 0;
    level.connect(envelope).connect(destination);
    const stereo = options.mode === "binaural";
    const detuning = stereo ? options.pulse / 2 : 0;

    for (const side of [-1, 1]) {
      const pan = track(context.createStereoPanner());
      pan.pan.value = stereo ? side : 0;
      pan.connect(level);
      const partials = [{ multiple: 1, shape: options.shape, amplitude: 1 }];
      if (options.harmonicGain > 0) {
        partials.push({ multiple: 2, shape: "sine", amplitude: options.harmonicGain });
      }
      for (const partial of partials) {
        const oscillator = track(context.createOscillator());
        const amplitude = track(context.createGain());
        oscillator.type = partial.shape;
        oscillator.frequency.value = (options.carrier + side * detuning) * partial.multiple;
        amplitude.gain.value = partial.amplitude;
        oscillator.connect(amplitude).connect(pan);
        generators.push(oscillator);
        pitched.push({ oscillator, side, multiple: partial.multiple });
      }
    }

    envelope.gain.value = stereo ? 1 : .5;
    if (!stereo) {
      const pulse = track(context.createOscillator());
      const depth = track(context.createGain());
      pulse.type = "sine";
      pulse.frequency.value = options.pulse;
      depth.gain.value = .5;
      pulse.connect(depth).connect(envelope.gain);
      generators.push(pulse);
    }
    generators.forEach(generator => generator.start());
    let disposed = false;
    return {
      level,
      retune(carrier, seconds = .12) {
        if (disposed) return;
        for (const voice of pitched) {
          voice.oscillator.frequency.setTargetAtTime(
            (carrier + voice.side * detuning) * voice.multiple,
            context.currentTime, seconds
          );
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        generators.forEach(generator => generator.stop());
        nodes.forEach(node => node.disconnect());
      }
    };
  }

  function createNoiseBuffer(context, kind, random = Math.random) {
    if (kind !== "pink" && kind !== "brown") throw new RangeError("Unknown noise texture");
    const seconds = 5;
    const length = Math.round(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);

    // Circular random curves at octave-spaced rates keep the loop continuous.
    // Equal layer energy gives a hiss; weighting slower layers gives a rumble.
    for (let rate = 16; rate <= context.sampleRate; rate *= 2) {
      const count = Math.max(2, Math.round(rate * seconds));
      const knots = Float32Array.from({ length: count }, () => random() * 2 - 1);
      const weight = kind === "brown" ? Math.sqrt(16 / rate) : 1;
      for (let frame = 0; frame < length; frame++) {
        const position = frame * count / length;
        const index = Math.floor(position), blend = position - index;
        const next = knots[(index + 1) % count];
        samples[frame] += (knots[index] + (next - knots[index]) * blend) * weight;
      }
    }

    let mean = 0, energy = 0, peak = 0;
    for (const sample of samples) mean += sample / length;
    for (let i = 0; i < length; i++) {
      samples[i] -= mean;
      energy += samples[i] * samples[i];
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    const rms = Math.sqrt(energy / length);
    const scale = rms > 0 ? Math.min(.12 / rms, .95 / peak) : 0;
    for (let i = 0; i < length; i++) samples[i] *= scale;
    return buffer;
  }

  globalThis.HarmonicsSynthesis = Object.freeze({ createVoice, createNoiseBuffer });
})();
