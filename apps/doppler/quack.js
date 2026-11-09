(() => {
  'use strict';
  // 合成的鴨叫聲。每隻小鴨有自己的叫聲（音高、音色、長短不同），方便分辨是誰被波打到；
  // 同一隻鴨子的叫聲固定不變，所以「多久叫一次」才是收到的頻率。
  const VOICES = [
    { wave: 'sawtooth', f: [330, 155], band: [1050, 660], q: 1.5, pulses: [[0, .26]] },            // A：原本的呱
    { wave: 'square', f: [210, 105], band: [700, 450], q: 2, pulses: [[0, .32]] },                // B：低沉
    { wave: 'sawtooth', f: [540, 270], band: [1700, 1050], q: 2, pulses: [[0, .2]] },             // C：高亢
    { wave: 'sawtooth', f: [300, 170], band: [950, 620], q: 1.6, pulses: [[0, .12], [.16, .12]] }, // D：呱呱兩聲
    { wave: 'triangle', f: [1100, 620], band: [2400, 1600], q: 1.2, pulses: [[0, .17]] },         // E：橡皮鴨吱吱
    { wave: 'sawtooth', f: [150, 82], band: [520, 340], q: 1.8, pulses: [[0, .4]] }               // F：大鵝
  ];
  window.DopplerQuack = class {
    constructor() { this.context = null; this.output = null; this.voices = new Set(); }
    get count() { return VOICES.length; }
    async unlock() {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        this.context ||= new Audio();
        if (this.context.state !== 'running') await this.context.resume();
        return this.context.state === 'running';
      } catch (_) { return false; }
    }
    // index：第幾隻小鴨（0 = A）；pan：-1 左 ～ 1 右；delay：延後幾秒
    play(index = 0, pan = 0, delay = 0) {
      const c = this.context; if (!c || c.state !== 'running') return false;
      if (!this.output || this.output.context !== c) {
        this.output = c.createDynamicsCompressor();
        this.output.threshold.value = -9; this.output.knee.value = 8; this.output.ratio.value = 6;
        this.output.attack.value = .003; this.output.release.value = .08;
        this.output.connect(c.destination);
      }
      const v = VOICES[((index % VOICES.length) + VOICES.length) % VOICES.length];
      v.pulses.forEach(([offset, duration]) => {
        const start = c.currentTime + .015 + delay + offset;
        const voice = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
        voice.type = v.wave; voice.frequency.setValueAtTime(v.f[0], start);
        voice.frequency.exponentialRampToValueAtTime(v.f[1], start + duration);
        filter.type = 'bandpass'; filter.frequency.setValueAtTime(v.band[0], start);
        filter.frequency.exponentialRampToValueAtTime(v.band[1], start + duration); filter.Q.value = v.q;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.9, start + .012);
        gain.gain.setValueAtTime(.7, start + duration * .35); gain.gain.exponentialRampToValueAtTime(.002, start + duration);
        voice.connect(filter); filter.connect(gain);
        const panner = c.createStereoPanner ? c.createStereoPanner() : null;
        if (panner) { panner.pan.value = Math.max(-.8, Math.min(.8, pan)); gain.connect(panner); panner.connect(this.output); }
        else gain.connect(this.output);
        const stop = () => { try { voice.stop(); } catch (_) {} };
        this.voices.add(stop);
        voice.onended = () => { voice.disconnect(); filter.disconnect(); gain.disconnect(); panner?.disconnect(); this.voices.delete(stop); };
        voice.start(start); voice.stop(start + duration);
      });
      return true;
    }
    stop() { for (const stop of this.voices) stop(); }
  };
})();
