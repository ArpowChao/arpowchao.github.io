// 課堂作答題目：對應公開觀課的六個收集點。
// setup：按「套用起始設定」時的水面設定（null 表示這題不用排水波）。
// fields：送出給老師時一併收集的欄位。
(function (root) {
  'use strict';
  const MOTION = ['靜止', '向右移動', '向左移動'];
  root.DopplerTasks = [
    {
      id: 'photo', title: '誰跑得最快？',
      q: '看天鵝與小鴨的照片：哪一隻跑得最快？',
      setup: null, image: false, reasonLabel: '理由',
      fields: [
        { key: 'fastest', label: '最快的是', type: 'text', placeholder: '例：右下的天鵝' },
        { key: 'clue', label: '判斷依據', type: 'choice', options: ['前密後疏', 'V 字波較長', '身體姿勢', '其他'] }
      ]
    },
    {
      id: 'still', title: '靜止打水',
      q: '原地每秒打水 1 下，排出 5 秒時的水波。',
      setup: { mach: 0, observers: false }, image: true, check: true, reasonLabel: '理由',
      fields: [
        { key: 'outer', label: '最外圈在第幾秒發出？', type: 'choice', options: ['t = 0 s', 't = 1 s', 't = 2 s', 't = 3 s', 't = 4 s', 't = 5 s'] }
      ]
    },
    {
      id: 'moving', title: '移動波源',
      q: '每人負責一種速度：排出 5 秒的水波，量前、後方相鄰兩圈的間距。',
      setup: { mach: 0.25, observers: false }, image: true, check: true, reasonLabel: '發現',
      fields: [
        { key: 'speed', label: '我的速度', type: 'choice', options: ['¼ 波速', '½ 波速', '¾ 波速'], fromMach: true },
        { key: 'front', label: '前方間距（m）', type: 'number', fill: 'ruler' },
        { key: 'back', label: '後方間距（m）', type: 'number', fill: 'ruler' },
        { key: 'waveSpeed', label: '水波速度會？', type: 'choice', options: ['變快', '不變', '變慢'] }
      ]
    },
    {
      id: 'ducks', title: '誰被打得多？',
      q: '波源 ½ 波速向右。先預測，再播放，記下 A、B 被打到的間隔。',
      setup: { mach: 0.5, observers: true }, image: true, check: true, reasonLabel: '和間距的關係',
      fields: [
        { key: 'predict', label: '預測', type: 'choice', options: ['A 較頻繁', 'B 較頻繁', '一樣'] },
        { key: 'aInt', label: 'A 間隔（s）', type: 'number', fill: 'duckA' },
        { key: 'bInt', label: 'B 間隔（s）', type: 'number', fill: 'duckB' }
      ]
    },
    {
      id: 'observer', title: '觀察者移動',
      q: '按「套用起始設定」再按「▶ 播放」：波源靜止，小鴨以 0.5 倍波速向左游。記下 A（迎著波）、B（順著波）每秒被打幾次。',
      setup: { mach: 0, observers: true, swim: true }, image: true, reasonLabel: '頻率為什麼變？',
      fields: [
        { key: 'fNear', label: 'A 迎著波：每秒幾次', type: 'number', fill: 'freqA' },
        { key: 'fFar', label: 'B 順著波：每秒幾次', type: 'number', fill: 'freqB' },
        { key: 'lambda', label: '波長會？', type: 'choice', options: ['變短', '不變', '變長'] }
      ]
    },
    {
      id: 'exit', title: '出口票',
      q: '判斷 A～D 波源的運動。',
      setup: null, image: false, figure: 'abcd', reasonLabel: '理由（用波長、波速）',
      fields: [
        { key: 'A', label: 'A', type: 'choice', options: MOTION },
        { key: 'B', label: 'B', type: 'choice', options: MOTION },
        { key: 'C', label: 'C', type: 'choice', options: MOTION },
        { key: 'D', label: 'D', type: 'choice', options: MOTION },
        { key: 'faster', label: 'B、C 誰快？', type: 'choice', options: ['B 快', 'C 快', '一樣'] },
        { key: 'higher', label: '波源向右，誰收到的頻率高？', type: 'choice', options: ['前方', '後方', '一樣'] }
      ]
    }
  ];
})(window);
