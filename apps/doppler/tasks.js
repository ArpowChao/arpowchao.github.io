// 課堂作答題目：對應公開觀課的六個收集點。
// setup：題目的水面條件。只有觀察者移動那題（swim）會顯示「套用起始設定」；其他題學生自己選速度、自己排。
// fields：送出給老師時一併收集的欄位。
(function (root) {
  'use strict';
  const MOTION = ['靜止', '向右移動', '向左移動'];
  root.DopplerTasks = [
    {
      id: 'photo', title: '誰跑得最快？',
      q: '在照片上圈出來：藍筆圈在原地的、紅筆圈在移動的、螢光筆圈跑得最快的那一隻。',
      setup: null, image: false, draw: 'swans', reasonLabel: '你是看什麼判斷的？',
      fields: []
    },
    {
      id: 'still', title: '靜止打水',
      q: '鴨子在原地每秒打水 1 下，打了 5 秒。先預測，再把圓片排進水面；排好後打開小鴨、播放，數左邊小鴨被打到幾次。',
      setup: { mach: 0, observers: false }, image: true, check: true, reasonLabel: '判斷哪一圈最早，我看的是…；原本我認為…，排完後我認為…，因為…',
      fields: [
        { key: 'predict', label: '① 先預測：t = 0 秒的水波在', type: 'choice', options: ['最外圈', '最內圈', '不一定'] },
        { key: 'predictWhy', label: '我這樣預測，是因為', type: 'text' },
        { key: 'outer', label: '③ 排完後：最外圈是', type: 'choice', options: ['t = 0 s', 't = 1 s', 't = 2 s', 't = 3 s', 't = 4 s', 't = 5 s'] },
        { key: 'inner', label: '最內圈是', type: 'choice', options: ['t = 0 s', 't = 1 s', 't = 2 s', 't = 3 s', 't = 4 s', 't = 5 s'] },
        { key: 'center', label: '這些圓的圓心', type: 'choice', options: ['在同一點', '不在同一點'] },
        { key: 'perSec', label: '(1) 左邊小鴨每秒被水波打到幾次', type: 'number', fill: 'freqB' },
        { key: 'tenSec', label: '十秒內被打到幾次', type: 'number' }
      ]
    },
    {
      id: 'moving', title: '移動波源',
      q: '每人負責一種速度：排出 5 秒的水波，量前、後方相鄰兩圈的間距。',
      setup: { mach: 0.25, observers: false }, image: true, check: true, reasonLabel: '(2) 波源移速越大，水波形狀有何變化？（我從表格看到…所以我認為…）',
      fields: [
        { key: 'speed', label: '我的速度', type: 'choice', options: ['¼ 波速', '½ 波速', '¾ 波速'], fromMach: true },
        { key: 'front', label: '前方間距（m）', type: 'number', fill: 'ruler' },
        { key: 'back', label: '後方間距（m）', type: 'number', fill: 'ruler' },
        { key: 'waveSpeed', label: '◎ 波源越快，水波的波速會', type: 'choice', options: ['變快', '不變', '變慢'] },
        { key: 'waveWhy', label: '我的證據是', type: 'text' }
      ]
    },
    {
      id: 'ducks', title: '誰被打得多？',
      q: '波源以 ½ 波速向右，前方 A、後方 B 兩隻小鴨。先預測誰被打得比較頻繁，再打開小鴨、按「▶ 播放」，記下 A、B 被打到的間隔。',
      setup: { mach: 0.5, observers: true }, image: true, check: true, reasonLabel: '(3) 兩隻小鴨感受到的水波震動次數有何差別？（我看到…和預測比較，我的想法…）',
      fields: [
        { key: 'predict', label: '先預測：誰被打得比較頻繁？', type: 'choice', options: ['A 較頻繁', 'B 較頻繁', '一樣'] },
        { key: 'predictWhy', label: '我這樣預測，是因為', type: 'text' },
        { key: 'aInt', label: 'A 間隔（s）', type: 'number', fill: 'duckA' },
        { key: 'bInt', label: 'B 間隔（s）', type: 'number', fill: 'duckB' }
      ]
    },
    {
      id: 'observer', title: '觀察者移動',
      q: '按「套用起始設定」再按「▶ 播放」：波源靜止，小鴨以 0.5 倍波速向左游。記下 A（迎著波）、B（順著波）每秒被打幾次。',
      setup: { mach: 0, observers: true, swim: true }, image: true, reasonLabel: '(8) 靠近、遠離靜止的天鵝，感受到的頻率有何變化？為什麼？（波長、相對波速）',
      fields: [
        { key: 'fNear', label: 'A 迎著波：每秒幾次', type: 'number', fill: 'freqA' },
        { key: 'fFar', label: 'B 順著波：每秒幾次', type: 'number', fill: 'freqB' },
        { key: 'lambda', label: '水波的波長會', type: 'choice', options: ['變短', '不變', '變長'] }
      ]
    },
    {
      id: 'exit', title: '看水波判斷波源',
      q: '利用水波圖形判斷 A～D 波源的運動狀態（紅點是波源現在的位置）。',
      setup: null, image: false, figure: 'abcd', reasonLabel: '理由（用波長、波速）',
      fields: [
        { key: 'A', label: 'A', type: 'choice', options: MOTION },
        { key: 'B', label: 'B', type: 'choice', options: MOTION },
        { key: 'C', label: 'C', type: 'choice', options: MOTION },
        { key: 'D', label: 'D', type: 'choice', options: MOTION },
        { key: 'faster', label: 'B、C 哪一個跑得比較快？', type: 'choice', options: ['B 快', 'C 快', '一樣'] },
        { key: 'higher', label: '在波源前方或後方，哪裡收到的頻率比較高？', type: 'choice', options: ['前方', '後方', '一樣'] }
      ]
    }
  ];
})(window);
