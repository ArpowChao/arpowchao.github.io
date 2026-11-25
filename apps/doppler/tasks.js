// 課堂作答：只放「老師要拿全班結果引導討論」的關卡，順序跟著上課簡報走。
// kind：image＝只上傳圖（不用寫字）；idea＝寫想法（可附一個選項）；quiz＝看水波判斷波源（課後依結果派送因材網）。
// 數值（間距、間隔、每秒幾次）寫在學習單上，網頁不收。
// setup.arrange：要學生自己擺圓片的關卡，進來時水面先淨空；setup.swim：觀察者移動，給「套用起始設定」。
(function (root) {
  'use strict';
  const MOTION = ['靜止', '向右移動', '向左移動'];
  root.DopplerTasks = [
    {
      id: 'photo', group: 'photo', n: '1-1', kind: 'image', title: '圈照片',
      q: '圈出原地的、移動的、跑得最快的。',
      setup: null, draw: 'swans', fields: []
    },
    {
      id: 'photoWhy', group: 'photo', n: '1-2', kind: 'idea', title: '判斷的理由',
      q: '哪一隻跑得最快？你是看什麼判斷的？',
      setup: null, reasonLabel: '我是看…判斷的，因為…', fields: []
    },
    {
      id: 'still', group: 'still', n: '2', kind: 'image', title: '排出靜止打水',
      q: '鴨子在原地每秒打水 1 下，打了 5 秒。排出 5 秒時的水波。',
      setup: { arrange: true, mach: 0 }, check: true, fields: []
    },
    {
      id: 'moving', group: 'moving', n: '3-1', kind: 'image', title: '排出邊游邊打水',
      q: '鴨子邊游邊打水，每秒打 1 下，打了 5 秒。選好你的速度，排出 5 秒時的水波。',
      setup: { arrange: true, mach: 0.25, speed: true }, check: true,
      fields: [{ key: 'speed', label: '我負責的速度', type: 'choice', options: ['¼ 波速', '½ 波速', '¾ 波速'], fromMach: true }]
    },
    {
      id: 'waveSpeed', group: 'moving', n: '3-2', kind: 'idea', title: '水波跑得更快嗎？',
      q: '想一想：波源游得越快，水波本身跑得更快嗎？',
      setup: null, reasonLabel: '我的證據是…',
      fields: [{ key: 'waveSpeed', label: '水波本身的速度會', type: 'choice', options: ['變快', '不變', '變慢'] }]
    },
    {
      id: 'ducks', group: 'ducks', n: '4', kind: 'idea', title: '先預測：誰被打得多？',
      q: '波源向右游，前方 A、後方 B 兩隻小鴨，誰被水波打得比較頻繁？',
      setup: null, reasonLabel: '我這樣預測，是因為…',
      fields: [{ key: 'predict', label: '我的預測', type: 'choice', options: ['A 比較頻繁', 'B 比較頻繁', '一樣'] }]
    },
    {
      id: 'observer', group: 'observer', n: '5', kind: 'idea', title: '小鴨自己游',
      q: '天鵝在原地打水，A 迎著波、B 順著波游。圈圈（波長）有沒有變？為什麼每秒碰到的圈數不一樣？',
      setup: { mach: 0, observers: true, swim: true }, reasonLabel: '每秒碰到的圈數不一樣，是因為…',
      fields: [{ key: 'lambda', label: '圈圈（波長）有沒有變？', type: 'choice', options: ['有變', '沒有變'] }]
    },
    {
      id: 'exit', group: 'exit', n: '6', kind: 'quiz', title: '看水波判斷波源',
      q: '利用水波圖形判斷 A～D 波源的運動狀態（紅點是波源現在的位置）。',
      setup: null, figure: 'abcd', reasonLabel: 'B、C 誰比較快，為什麼？（我比較的是：波長？圓心間距？所以我判斷…）',
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
