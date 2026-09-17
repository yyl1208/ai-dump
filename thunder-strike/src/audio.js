// 零素材合成音效层。
// 运营规范 2.8.2 把「经过设计的 UI、音效等必要元素」写进了游戏质量要求，
// 但为了几个音塞几 KB 的 wav 不值当 —— 这里用 WebAudio 振荡器现场合成 8-bit 音效。
// 小游戏走 wx.createWebAudioContext（基础库 2.19+），web 走 AudioContext，
// 任何一步失败都静默降级成"没声音"，绝不影响游戏本体。
const Audio8 = (function () {
  let ctx = null, master = null, noiseBuf = null;
  let failed = false;
  let enabled = Platform.store.get('ts_sound', '1') !== '0';
  const lastAt = {};

  function ensure() {
    if (ctx || failed) return ctx;
    try {
      let AC = null;
      if (typeof wx !== 'undefined' && wx.createWebAudioContext) AC = wx.createWebAudioContext();
      else if (typeof tt !== 'undefined' && tt.createWebAudioContext) AC = tt.createWebAudioContext();
      else if (typeof AudioContext !== 'undefined') AC = new AudioContext();
      if (!AC) { failed = true; return null; }
      ctx = AC;
      master = ctx.createGain();
      master.gain.value = 0.30;
      master.connect(ctx.destination);

      const n = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      failed = true; ctx = null;
    }
    return ctx;
  }

  // iOS / 部分安卓要求用户手势之后才能出声
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended' && c.resume) {
      try { c.resume(); } catch (e) {}
    }
  }
  function suspend() {
    if (ctx && ctx.state === 'running' && ctx.suspend) {
      try { ctx.suspend(); } catch (e) {}
    }
  }

  function tone(type, f0, f1, dur, gain, delay) {
    const c = ensure();
    if (!c || !enabled) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(1, f0), t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  function noise(dur, gain, f0, f1, delay) {
    const c = ensure();
    if (!c || !enabled || !noiseBuf) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const s = c.createBufferSource();
      s.buffer = noiseBuf;
      const bp = c.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.setValueAtTime(Math.max(1, f0), t0);
      if (f1 && f1 !== f0) bp.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(bp); bp.connect(g); g.connect(master);
      s.start(t0);
      s.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  // 同名音效的最小间隔，避免密集开火把节点刷爆
  function gate(key, ms) {
    const t = Platform.now();
    if (lastAt[key] && t - lastAt[key] < ms) return false;
    lastAt[key] = t;
    return true;
  }

  return {
    unlock: unlock,
    suspend: suspend,
    isEnabled: function () { return enabled; },
    setEnabled: function (v) {
      enabled = !!v;
      Platform.store.set('ts_sound', enabled ? '1' : '0');
      if (enabled) unlock();
    },
    play: function (name) {
      if (!enabled || failed) return;
      switch (name) {
        case 'shoot':
          if (!gate('shoot', 70)) return;
          tone('square', 880, 380, 0.055, 0.045); break;
        case 'hit':
          if (!gate('hit', 40)) return;
          noise(0.07, 0.07, 2000, 400); break;
        case 'boom':
          if (!gate('boom', 45)) return;
          noise(0.34, 0.16, 1100, 70);
          tone('sawtooth', 170, 45, 0.3, 0.08); break;
        case 'pickup':
          tone('square', 660, 660, 0.06, 0.075);
          tone('square', 990, 990, 0.08, 0.075, 0.06); break;
        case 'power':
          tone('triangle', 520, 1040, 0.16, 0.09); break;
        case 'hurt':
          tone('sawtooth', 320, 70, 0.26, 0.14);
          noise(0.18, 0.09, 800, 120); break;
        case 'bomb':
          noise(0.6, 0.22, 1600, 50);
          tone('sine', 130, 32, 0.55, 0.18); break;
        case 'warn':
          tone('square', 440, 440, 0.11, 0.09);
          tone('square', 440, 440, 0.11, 0.09, 0.17); break;
        case 'over':
          tone('square', 392, 392, 0.15, 0.10);
          tone('square', 330, 330, 0.15, 0.10, 0.17);
          tone('square', 220, 110, 0.5, 0.12, 0.34); break;
        case 'ui':
          if (!gate('ui', 60)) return;
          tone('square', 720, 900, 0.05, 0.06); break;
        case 'record':
          tone('square', 523, 523, 0.1, 0.09);
          tone('square', 659, 659, 0.1, 0.09, 0.1);
          tone('square', 784, 784, 0.1, 0.09, 0.2);
          tone('square', 1046, 1046, 0.22, 0.09, 0.3); break;
      }
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Audio8;
