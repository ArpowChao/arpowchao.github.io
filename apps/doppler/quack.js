(() => {
  'use strict';
  // A short, nasal synthesized duck call; both ducks use the same call so the
  // arrival rhythm, rather than a changed pitch, conveys the received frequency.
  window.DopplerQuack = class {
    constructor() { this.context = null; this.output = null; this.voices = new Set(); }
    async unlock() {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        this.context ||= new Audio();
        if (this.context.state !== 'running') await this.context.resume();
        return this.context.state === 'running';
      } catch (_) { return false; }
    }
    play(side) {
      const c = this.context; if (!c || c.state !== 'running') return false;
      if (!this.output || this.output.context !== c) {
        this.output = c.createDynamicsCompressor();
        this.output.threshold.value = -9; this.output.knee.value = 8; this.output.ratio.value = 6;
        this.output.attack.value = .003; this.output.release.value = .08;
        this.output.connect(c.destination);
      }
      const start = c.currentTime + .015, duration = .26;
      const voice = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
      voice.type = 'sawtooth'; voice.frequency.setValueAtTime(330, start);
      voice.frequency.exponentialRampToValueAtTime(155, start + duration);
      filter.type = 'bandpass'; filter.frequency.setValueAtTime(1050, start);
      filter.frequency.exponentialRampToValueAtTime(660, start + duration); filter.Q.value = 1.5;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.9, start + .012);
      gain.gain.setValueAtTime(.7, start + .09); gain.gain.exponentialRampToValueAtTime(.002, start + duration);
      voice.connect(filter); filter.connect(gain);
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      if (pan) { pan.pan.value = side ? -.35 : .35; gain.connect(pan); pan.connect(this.output); }
      else gain.connect(this.output);
      const stop = () => { try { voice.stop(); } catch (_) {} };
      this.voices.add(stop);
      voice.onended = () => { voice.disconnect(); filter.disconnect(); gain.disconnect(); pan?.disconnect(); this.voices.delete(stop); };
      voice.start(start); voice.stop(start + duration);
      return true;
    }
    stop() { for (const stop of this.voices) stop(); }
  };
})();
