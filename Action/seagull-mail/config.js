/**
 * 海風專題信箱（Seagull Mail）設定檔
 * -----------------------------------------------------------
 * 1. 若尚未設定 Google Apps Script，保留 gasUrl 為空字串 ''，
 *    系統會自動啟動「展示＋本機試寫模式」，讓你可以直接預覽與測試。
 * 2. 部署好 gas/Code.gs 後，只要把 Web App 網址貼到下方 gasUrl，
 *    或直接在網頁右上角點擊「連線狀態徽章」貼上網址即可即時同步 Google Sheet。
 */
(function (global) {
  'use strict';

  global.SEAGULL_CONFIG = {
    eventTitle: '海風專題信箱',
    eventSubtitle: '專題成果發表・海鷗即時留言牆',

    // 留空會自動使用目前瀏覽網址（若是本機 file:// 開啟則改用下方預設網址）
    publicUrl: '',

    // 貼上 Google Apps Script Web App 部署網址（以 /exec 結尾），留空為展示模式
    gasUrl: 'https://script.google.com/macros/s/AKfycbyucTpmsBMFBM8Q6H1rj6j6SHQLOQL7JejsZBGJy9NGfXgwOHid_ilag0jkLEheM5IjJQ/exec',

    // 大螢幕背景輪詢間隔（毫秒）；搭配 GAS 20 秒快取可設為 6000 ms 即時偵測新信
    pollIntervalMs: 6000,

    // 自動輪播時每封明信片停留秒數
    autoRotateSec: 9,

    // 單則留言最大字數
    maxBodyLength: 120,

    // 專題分組設定（可依實際發表組別自由增減或改名）
    groups: [
      { id: 'ai', name: '智慧互動組', color: '#2b7de9', stamp: '波' },
      { id: 'physics', name: '物理實驗組', color: '#0d9488', stamp: '光' },
      { id: 'green', name: '永續綠能組', color: '#16a34a', stamp: '風' },
      { id: 'design', name: '創意設計組', color: '#e66a2c', stamp: '帆' },
      { id: 'all', name: '給全體專題', color: '#d94862', stamp: '海' }
    ],

    // 寫信端可選的 5 種日系海鷗頭像
    avatars: [
      { id: 'sailor', name: '水手帽海鷗', tagline: '準時遞送每一道海風' },
      { id: 'shades', name: '墨鏡酷海鷗', tagline: '今天海邊陽光特別刺眼' },
      { id: 'fries', name: '薯條貪吃鷗', tagline: '送完信可以分我一根嗎' },
      { id: 'straw', name: '草帽度假鷗', tagline: '從湘南海岸悠閒飛過來' },
      { id: 'scarf', name: '點點領巾鷗', tagline: '帶著滿滿祝福飛向大家' }
    ],

    // 未接上 GAS 前（或做為初期暖場範本）的示範信件
    demoLetters: [
      {
        id: 'demo-1',
        timestamp: '2026-11-19T14:05:00+08:00',
        group: '物理實驗組',
        sender: '208 陳同學',
        avatar: 'sailor',
        message: '看到你們把半導體位能山丘跟棒球縫線流場視覺化，物理課突然變得像看動畫一樣好懂！'
      },
      {
        id: 'demo-2',
        timestamp: '2026-11-19T14:08:00+08:00',
        group: '智慧互動組',
        sender: '路過學姐',
        avatar: 'shades',
        message: '現場試玩手勢辨識切換簡報真的超順暢，請問鏡頭在逆光環境下誤判率要怎麼壓低呢？'
      },
      {
        id: 'demo-3',
        timestamp: '2026-11-19T14:12:00+08:00',
        group: '永續綠能組',
        sender: '來賓林老師',
        avatar: 'straw',
        message: '用海風潮汐資料結合學校屋頂太陽能實測數據非常有說服力，期待你們下一版減碳試算模型！'
      },
      {
        id: 'demo-4',
        timestamp: '2026-11-19T14:16:00+08:00',
        group: '創意設計組',
        sender: '美術社阿哲',
        avatar: 'scarf',
        message: '這套日系海邊色票配字體太舒服了！現場導覽手冊的摺頁排版讓人忍不住帶回家收藏。'
      },
      {
        id: 'demo-5',
        timestamp: '2026-11-19T14:20:00+08:00',
        group: '給全體專題',
        sender: '評審老師',
        avatar: 'sailor',
        message: '每個組別都能用三分鐘說清楚「為什麼想解這個問題」而不只是堆技術名詞，是今年最棒的一點！'
      },
      {
        id: 'demo-6',
        timestamp: '2026-11-19T14:24:00+08:00',
        group: '物理實驗組',
        sender: '105 小宇',
        avatar: 'fries',
        message: '二極體實驗室把內阻加上去之後，紅光 LED 不再數字暴衝，剛剛自己拉滑桿玩了好久！'
      },
      {
        id: 'demo-7',
        timestamp: '2026-11-19T14:28:00+08:00',
        group: '永續綠能組',
        sender: '海風訪客',
        avatar: 'scarf',
        message: '小型垂直軸風機葉片是用回收寶特瓶熱塑的嗎？轉起來居然比想像中安靜很多耶。'
      },
      {
        id: 'demo-8',
        timestamp: '2026-11-19T14:31:00+08:00',
        group: '智慧互動組',
        sender: '資研社小凱',
        avatar: 'shades',
        message: '好奇你們後端 API 回應速度怎麼維持在 200ms 內？簡報裡的那張架構圖超清楚。'
      },
      {
        id: 'demo-9',
        timestamp: '2026-11-19T14:35:00+08:00',
        group: '創意設計組',
        sender: '304 小晴',
        avatar: 'straw',
        message: '原本只是陪朋友來看發表，結果在互動攤位蓋章集滿明信片，整體動線流暢又療癒。'
      },
      {
        id: 'demo-10',
        timestamp: '2026-11-19T14:39:00+08:00',
        group: '給全體專題',
        sender: '家長會志工',
        avatar: 'fries',
        message: '看到每位同學眼神都在發亮地介紹自己的作品，這幾個月熬夜改程式與做模型都值得了，加油！'
      },
      {
        id: 'demo-11',
        timestamp: '2026-11-19T14:42:00+08:00',
        group: '物理實驗組',
        sender: '棒球社阿翰',
        avatar: 'shades',
        message: '終於搞懂為什麼轉速一樣但陀螺角不同會差那麼多，你們的共軌 0.2 秒暫停對比超有感！'
      },
      {
        id: 'demo-12',
        timestamp: '2026-11-19T14:46:00+08:00',
        group: '給全體專題',
        sender: '畢業學長',
        avatar: 'sailor',
        message: '趁這陣海風把所有煩惱吹散，祝今天的專題發表圓滿順利，記得結束後全組一起吃頓好料的！'
      }
    ]
  };
})(window);
