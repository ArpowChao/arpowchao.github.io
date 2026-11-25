// 課堂作答：只放上課要拿全班結果討論的問題。段落與編號對齊學習單（一、二、三、四、六大題；n＝學習單題號，一句話結論學習單上沒有題號）。
// kind：image＝只上傳圖；idea＝寫想法（可附一個選項）；form＝只填欄位（數據、投票、一句話結論）。
// setup.arrange：自己擺圓片（進來時水面淨空）；setup.watch＋board：沿用某一張排好的圖，放上小鴨觀察；setup.swim：觀察者移動。
// 其他關卡只看不操作：setup.view 指定顯示哪一張排好的圖，沒有就是空白水面；右邊的控制面板都不出現。
// 四、波與觀察者延續三的水波：scene='ab' 顯示自己在 6 排的圖，加上前方 A、後方 B 兩隻小鴨（先預測，不能播放）；之後兩關可以播放，鴨子照自己的移速繼續邊游邊打水。
(function (root) {
  'use strict';
  const T5 = ['t = 0 s', 't = 1 s', 't = 2 s', 't = 3 s', 't = 4 s', 't = 5 s'];
  const QTY = ['波速', '波長', '頻率'];
  const ONE_LINE = [
    { key: 'when', label: '當', type: 'text', placeholder: '（條件）' },
    { key: 'cause', label: '造成', type: 'text', placeholder: '（影響）' },
    { key: 'so', label: '所以', type: 'text', placeholder: '（結果）' }
  ];
  root.DopplerTasks = [
    // 一、生活體驗
    { id: 'photo', group: 'photo', n: '2、3', kind: 'image', title: '圈的結果圖', q: '圈出原地的、移動的、跑得最快的。', setup: null, draw: 'swans', fields: [] },
    { id: 'photoWhy', group: 'photo', n: '4', kind: 'idea', title: '判斷的理由', q: '你判斷的理由是什麼？', setup: null, reasonLabel: '我的理由', fields: [] },
    // 二、靜止打水
    { id: 'still', group: 'still', n: '5②', kind: 'image', title: '擺圖', q: '鴨子在原地每秒打水 1 下，打了 5 秒。排出 5 秒時的水波。',
      setup: { arrange: true, mach: 0 }, check: true, fields: [] },
    { id: 'outer', group: 'still', n: '5③', kind: 'idea', title: '最外圈是幾秒打出來的', q: '最外圈是 t = 幾秒打出來的？為什麼？', setup: { view: 'still' }, reasonLabel: '因為',
      fields: [{ key: 'outer', label: '最外圈是', type: 'choice', options: T5 }] },
    { id: 'hits', group: 'still', n: '(1)', kind: 'form', title: '觀察小鴨', q: '小鴨 10 秒被水波打到幾次？每秒被打到幾次？',
      setup: { watch: true, board: 'still', mach: 0 },
      fields: [{ key: 'ten', label: '10 秒被水波打到的次數', type: 'number' }, { key: 'per', label: '每秒被水波打到的次數', type: 'number' }] },
    // 三、移動的波源
    { id: 'moving', group: 'moving', n: '6', kind: 'image', title: '鴨子移速擺圖', q: '鴨子邊游邊打水，每秒打 1 下，打了 5 秒。選好你負責的移速，排出 5 秒時的水波。',
      setup: { arrange: true, mach: 0.25, speed: true }, check: true,
      fields: [{ key: 'speed', label: '我負責的速度', type: 'choice', options: ['¼ 波速', '½ 波速', '¾ 波速'], fromMach: true }] },
    { id: 'shape', group: 'moving', n: '(2)', kind: 'idea', title: '水波形狀的變化', q: '鴨子移速越大，水波形狀有何變化？', setup: { view: 'moving' }, reasonLabel: '我看到', fields: [] },
    { id: 'waveSpeed', group: 'moving', n: '◎', kind: 'idea', title: '水波波速的變化', q: '當鴨子移速越大，水波波速有何變化？', setup: { view: 'moving' }, reasonLabel: '因為',
      fields: [{ key: 'waveSpeed', label: '水波波速', type: 'choice', options: ['變快', '不變', '變慢'] }] },
    // 四、波與觀察者
    { id: 'vote', group: 'ducks', n: '◎', kind: 'form', title: '誰被打得比較頻繁', q: '鴨子向右游，前方 A、後方 B 兩隻小鴨，你覺得誰被水波打得比較頻繁？', setup: { view: 'moving', scene: 'ab', mach: 0.5 },
      fields: [{ key: 'predict', label: '我覺得', type: 'choice', options: ['A 比較頻繁', 'B 比較頻繁', '一樣'] }] },
    { id: 'quantity', group: 'ducks', n: '(4)', kind: 'form', title: '是哪個物理量', q: '水波形狀分布是哪個物理量？水波震動次數是哪一個物理量？', setup: { watch: true, board: 'moving', mach: 0.5 },
      fields: [{ key: 'shapeQ', label: '水波形狀分布', type: 'choice', options: QTY }, { key: 'hitsQ', label: '水波震動次數', type: 'choice', options: QTY }] },
    { id: 'concl4', group: 'ducks', n: '', kind: 'form', title: '一句話結論', q: '一句話結論：當…（條件），造成…（影響），所以…（結果）', setup: { watch: true, board: 'moving', mach: 0.5 }, fields: ONE_LINE },
    // 五、觀察者運動
    { id: 'why5', group: 'observer', n: '(6)(7)', kind: 'idea', title: '靠近與遠離', q: '為何靠近時會接收到更多波數，而遠離卻會接收到較少波數？',
      setup: { mach: 0, observers: true, swim: true }, reasonLabel: '我認為', fields: [] },
    { id: 'concl5', group: 'observer', n: '', kind: 'form', title: '一句話結論', q: '一句話結論：當…（條件），造成…（影響），所以…（結果）', setup: null, fields: ONE_LINE }
  ];
})(window);
