(() => {
  'use strict';
  // 合成的鴨叫聲。每隻小鴨有自己的叫聲（音高、音色、長短不同），方便分辨是誰被波打到；
  // 同一隻鴨子的叫聲固定不變，所以「多久叫一次」才是收到的頻率。
  // 四隻常用小鴨刻意拉開「音域＋音色＋節奏」三個面向，閉上眼睛也分得出來：
  //   A 中音「呱」（下滑）　B 很低的「嗡」　C 很高的「叮」（鈴聲）　D 上揚的「啾啾」兩聲
  const VOICES = [
    { name: '呱', wave: 'sawtooth', f: [340, 160], band: [1100, 650], q: 1.6, pulses: [[0, .24]] },
    { name: '嗡', wave: 'square', f: [95, 80], band: [420, 300], q: 1.4, pulses: [[0, .34]], level: 1 },
    { name: '叮', wave: 'sine', f: [1568, 1568], band: null, pulses: [[0, .45]], ring: true, level: .55, harmonic: 3136 },
    { name: '啾啾', wave: 'triangle', f: [620, 1250], band: null, pulses: [[0, .09], [.13, .09]], level: .8 },
    { name: '吱', wave: 'square', f: [2100, 1700], band: [2600, 2000], q: 3, pulses: [[0, .12]], level: .45 },
    { name: '咚', wave: 'sine', f: [220, 110], band: null, pulses: [[0, .22]], ring: true, level: 1 }
  ];
  const nameOf = i => VOICES[((i % VOICES.length) + VOICES.length) % VOICES.length].name;
  window.DopplerQuack = class {
    constructor() { this.context = null; this.output = null; this.voices = new Set(); }
    get count() { return VOICES.length; }
    name(i) { return nameOf(i); }
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
        const start = c.currentTime + .015 + delay + offset, peak = .9 * (v.level || 1);
        const gain = c.createGain(), nodes = [gain];
        if (v.ring) { // 敲擊聲：瞬間起音、指數衰減
          gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(peak, start + .004);
          gain.gain.exponentialRampToValueAtTime(.001, start + duration);
        } else {
          gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(peak, start + .012);
          gain.gain.setValueAtTime(peak * .8, start + duration * .35); gain.gain.exponentialRampToValueAtTime(.002, start + duration);
        }
        const tone = (freqs, type, level) => {
          const osc = c.createOscillator(); osc.type = type;
          osc.frequency.setValueAtTime(freqs[0], start); osc.frequency.exponentialRampToValueAtTime(freqs[1], start + duration);
          let tail = osc;
          if (level !== 1) { const g = c.createGain(); g.gain.value = level; osc.connect(g); tail = g; nodes.push(g); }
          if (v.band) {
            const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = v.q;
            filter.frequency.setValueAtTime(v.band[0], start); filter.frequency.exponentialRampToValueAtTime(v.band[1], start + duration);
            tail.connect(filter); tail = filter; nodes.push(filter);
          }
          tail.connect(gain); nodes.push(osc); return osc;
        };
        const oscs = [tone(v.f, v.wave, 1)];
        if (v.harmonic) oscs.push(tone([v.harmonic, v.harmonic], 'sine', .3));
        const panner = c.createStereoPanner ? c.createStereoPanner() : null;
        if (panner) { panner.pan.value = Math.max(-.8, Math.min(.8, pan)); gain.connect(panner); panner.connect(this.output); nodes.push(panner); }
        else gain.connect(this.output);
        const stop = () => oscs.forEach(o => { try { o.stop(); } catch (_) {} });
        this.voices.add(stop);
        oscs[0].onended = () => { nodes.forEach(n => n.disconnect()); this.voices.delete(stop); };
        oscs.forEach(o => { o.start(start); o.stop(start + duration + .02); });
      });
      return true;
    }
    stop() { for (const stop of this.voices) stop(); }
  };
})();
