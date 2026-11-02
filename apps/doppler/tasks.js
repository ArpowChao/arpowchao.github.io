// 課堂作答題目：對應公開觀課的六個收集點。
// setup：按「套用這題的起始設定」時的水面設定（null 表示這題不用排水波）。
// fields：送出給老師時一併收集的欄位。
(function (root) {
  'use strict';
  const SIM_URL = 'https://arpowchao.github.io/phy-senior/gsat_physics_review.html#lab-N15';
  root.DopplerTasks = [
    {
      id: 'photo', title: '生活體驗：誰跑得最快？',
      q: '看投影的天鵝與小鴨照片：哪些在原地？哪些在移動？哪一隻跑得最快？寫出你判斷的理由。',
      setup: null, image: false,
      reasonLabel: '我的理由',
      fields: [
        { key: 'fastest', label: '最快的是哪一隻？（寫位置或特徵）', type: 'text', placeholder: '例如：右下角的天鵝' },
        { key: 'clue', label: '主要的判斷依據', type: 'choice', options: ['水波前方密、後方疏', '身後的 V 字水波比較長', '身體或姿勢', '其他'] }
      ]
    },
    {
      id: 'still', title: '靜止打水：哪一圈最早？',
      q: '鴨子在原地每秒打水 1 下。用圓片排出 5 秒時的水波，也放好當下波源位置。排好後再勾選「標出每圈的發波時間」檢查。最外圈是第幾秒發出的？為什麼？',
      setup: { mach: 0, observers: false }, image: true, check: true,
      reasonLabel: '為什麼？',
      fields: [
        { key: 'outer', label: '最外圈是第幾秒發出的？', type: 'choice', options: ['t = 0 s', 't = 1 s', 't = 2 s', 't = 3 s', 't = 4 s', 't = 5 s'] }
      ]
    },
    {
      id: 'moving', title: '移動波源：比較 ¼、½、¾ 波速',
      q: '小組每人負責一種速度：排出波源向右移動時 5 秒的水波，用「量測兩點距離」量前方（右側）與後方（左側）相鄰兩圈的間距，各送出一次。',
      setup: { mach: 0.25, observers: false }, image: true, check: true,
      reasonLabel: '我的發現',
      fields: [
        { key: 'speed', label: '我負責的波源速度', type: 'choice', options: ['¼ 波速', '½ 波速', '¾ 波速'], fromMach: true },
        { key: 'front', label: '前方（右側）相鄰波間距（m）', type: 'number', fill: 'ruler' },
        { key: 'back', label: '後方（左側）相鄰波間距（m）', type: 'number', fill: 'ruler' },
        { key: 'waveSpeed', label: '鴨子游得越快，水波本身的速度？', type: 'choice', options: ['變快', '不變', '變慢'] }
      ]
    },
    {
      id: 'ducks', title: '波 × 觀察者：誰被打得比較頻繁？',
      q: '波源以 ½ 波速向右移動。先預測前方 A、後方 B 兩隻小鴨誰被波打得比較頻繁，再按「播放我的排列」，記下兩隻小鴨被打到的間隔。',
      setup: { mach: 0.5, observers: true }, image: true, check: true,
      reasonLabel: '和波間距有什麼關係？',
      fields: [
        { key: 'predict', label: '播放前的預測', type: 'choice', options: ['A（前方）較頻繁', 'B（後方）較頻繁', '一樣頻繁'] },
        { key: 'aInt', label: 'A 小鴨被打到的間隔（s）', type: 'number', fill: 'duckA' },
        { key: 'bInt', label: 'B 小鴨被打到的間隔（s）', type: 'number', fill: 'duckB' }
      ]
    },
    {
      id: 'observer', title: '觀察者運動 × 波：換觀察者動',
      q: '開啟模擬動畫，選「波源靜止、左右觀察者移動」，觀察者速度設 0.5v。記錄接近側與遠離側的視頻率，並判斷觀察者移動時波長有沒有改變。',
      setup: null, image: false, link: { href: SIM_URL, label: '開啟觀察者移動模擬動畫 ↗' },
      reasonLabel: '接收頻率為什麼會改變？',
      fields: [
        { key: 'fNear', label: '接近側的視頻率 f′（Hz）', type: 'number' },
        { key: 'fFar', label: '遠離側的視頻率 f′（Hz）', type: 'number' },
        { key: 'lambda', label: '觀察者移動時，波長？', type: 'choice', options: ['變短', '不變', '變長'] }
      ]
    },
    {
      id: 'exit', title: '出口票：由水波圖判斷運動',
      q: '下列四個波源每隔相同時間發出一圈水波。判斷 A～D 的運動狀態，並回答第二題。',
      setup: null, image: false, figure: 'abcd',
      reasonLabel: '第二題的理由（用波長、波速說明）',
      fields: [
        { key: 'A', label: 'A 的運動狀態', type: 'choice', options: ['靜止', '向右移動', '向左移動'] },
        { key: 'B', label: 'B 的運動狀態', type: 'choice', options: ['靜止', '向右移動', '向左移動'] },
        { key: 'C', label: 'C 的運動狀態', type: 'choice', options: ['靜止', '向右移動', '向左移動'] },
        { key: 'D', label: 'D 的運動狀態', type: 'choice', options: ['靜止', '向右移動', '向左移動'] },
        { key: 'faster', label: 'B 和 C 誰移動得比較快？', type: 'choice', options: ['B 較快', 'C 較快', '一樣快'] },
        { key: 'higher', label: '第二題：波源以 ½ 波速向右移動，誰收到的頻率較高？', type: 'choice', options: ['前方（右側）觀察者', '後方（左側）觀察者', '一樣'] }
      ]
    }
  ];
})(window);
