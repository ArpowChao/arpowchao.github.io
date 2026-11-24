// 中／英切換：頁面上的中文在顯示時換成英文（資料與送給老師的內容不變）
(function () {
  'use strict';
  const CJK = /[⺀-鿿＀-￯　-〿]/;
  // 先套用的整句規則（含數字）
  const RULES = [
    [/^(\d+)班 (\d+)組 (\d+)號$/, '$1 · G$2 · #$3'],
    [/(\d+) 班 (\d+) 號 第 (\d+) 組/, 'Class $1 · Seat $2 · Group $3'],
    [/(\d+) 班 (\d+) 號/, 'Class $1 · Seat $2'],
    [/已套用第 (\d+) 題設定/g, 'Task $1 settings applied'],
    [/已送出第 (\d+) 題/g, 'Task $1 sent'],
    [/第 (\d+) 題/g, 'Task $1'],
    [/第 (\d+) 組/g, 'Group $1'],
    [/收到 (\d+) 次/g, 'Hits: $1'],
    [/抵達 (\d+) 次/g, 'Arrivals: $1'],
    [/間隔 ([\d.]+) s（每秒 ([\d.]+) 次）/g, 'Gap $1 s ($2 per s)'],
    [/頻率 ([\d.—]+) 次\/s/g, 'Frequency $1 /s'],
    [/經過 ([\d.]+) s/g, 'Elapsed $1 s'],
    [/([\d.]+) 秒的實驗紀錄/g, '$1 s experiment record'],
    [/距離 ([\d.]+) m/g, 'Distance $1 m'],
    [/波源移速 ([\d.]+) m\/s/g, 'Source speed $1 m/s'],
    [/([\d.¼½¾]+) 波速向(右|左)/g, (m, a, d) => a + ' wave speed, moving ' + (d === '右' ? 'right' : 'left')],
    [/波源向(右|左) · ([\d.]+) 波速/g, (m, d, a) => 'Source moving ' + (d === '右' ? 'right' : 'left') + ' · ' + a + ' wave speed'],
    [/＋ 小鴨（(\d+)）/g, '＋ Duckling ($1)'],
    [/(\d+) 個圓圈＋波源小鴨/g, '$1 rings + source duck'],
    [/已加入 ([A-Z]) 小鴨，可拖到想觀察的位置/g, 'Duckling $1 added. Drag it where you want to observe'],
    [/([A-Z]) 小鴨/g, 'Duckling $1'],
    [/圓片 (\d+) · 半徑/g, 'Ring $1 · radius'],
    [/圓片 (\d+)，半徑/g, 'Ring $1, radius']
  ];
  const EN = {
    '在照片上圈出來：藍筆圈在原地的、紅筆圈在移動的、螢光筆圈跑得最快的那一隻。': 'Circle them on the photo: blue for ones staying put, red for ones moving, highlighter for the fastest.',
    '在照片上圈出來': 'Circle them on the photo', '藍筆圈原地的、紅筆圈在移動的、螢光筆圈跑得最快的那一隻': 'Blue: staying put · Red: moving · Highlighter: the fastest',
    '在照片上圈': 'Circle on the photo', '藍筆：原地': 'Blue: still', '紅筆：移動': 'Red: moving', '螢光筆：最快': 'Highlighter: fastest', '✓ 完成': '✓ Done', '🖍 放大來圈': '🖍 Open large to circle',
    '先在照片上圈出來': 'Circle on the photo first', '按「✎ 作答」，再按「🖍 放大來圈」': 'Tap “✎ Answer”, then “🖍 Open large to circle”',
    '藍筆圈在原地的、紅筆圈在移動的': 'Circle ones staying put in blue and moving ones in red', '螢光筆圈跑得最快的那一隻': 'Mark the fastest with the highlighter',
    '寫下你是看什麼判斷的，再送出': 'Write what you looked at to decide, then send',
    '選這題會打開照片：藍筆圈在原地的、紅筆圈在移動的': 'This task opens the photo: circle ones staying put in blue, moving ones in red',
    '螢光筆圈跑得最快的那一隻，按「✓ 完成」': 'Mark the fastest with the highlighter, then tap “✓ Done”',
    '按「✎ 作答」寫下你是看什麼判斷的，再送出': 'Tap “✎ Answer”, write what you looked at to decide, then send',
    '想改：在作答區按「🖍 放大來圈」': 'To change it: tap “🖍 Open large to circle” in the answer panel',
    '都卜勒・水波實驗 | Physics Lab': 'Doppler Ripple Lab | Physics Lab', '都卜勒水波': 'Doppler Ripples', '都卜勒・水波實驗': 'Doppler Ripple Lab',
    '一圈一圈排出水波，量測、播放，作答直接送給老師。': 'Place ripples ring by ring, measure, play, and send your answers to your teacher.',
    '水波與都卜勒效應': 'Ripples and the Doppler effect', '前往作答 ↓': 'Go to answers ↓', '一圈一圈，看見頻率的改變。': 'Ring by ring, see the frequency change.',
    '一圈一圈，看見頻率的改變': 'Ring by ring, see the frequency change', '都卜勒': 'Doppler ', '水波實驗': 'Ripple Lab', '排水波 → 量測 → 送出': 'Place ripples → measure → submit',
    '水波互動實驗': 'Interactive ripple lab', '水面俯視圖': 'Top view of the water', '波源靜止': 'Source at rest', '常用操作': 'Quick tools',
    '🦆 小鴨': '🦆 Ducklings', '小鴨': 'Ducklings', '＋ 小鴨': '＋ Duckling', '移除一隻小鴨': 'Remove a duckling', '發波時間': 'Emit times', '📏 量距離': '📏 Measure', '▶ 示範': '▶ Demo',
    '↔ 觀察者動': '↔ Moving observer', '⛶ 全螢幕': '⛶ Full screen', '✕ 離開全螢幕': '✕ Exit full screen', '對齊格線': 'Snap to grid', '播放學生排列的波前': 'Play the wavefronts you placed',
    '▶ 播放': '▶ Play', 'Ⅱ 暫停': 'Ⅱ Pause', '▶ 重播': '▶ Replay', '▶ 繼續': '▶ Resume', '回到排列': 'Back to layout', '呱聲': 'Quack sound', '♫ 試聽': '♫ Test sound',
    '間隔 —': 'Gap —', '圓片': 'Rings', '拖進水面': 'Drag onto the water', '斜看': 'Angled', '俯視': 'Top', '貼近水面': 'Water level',
    '從圓片盤拖入水面，或點選圓片後在水面點一下放置。拖曳圓心或圓周可移動已放好的水波。方向鍵微調選定圓片；量測模式可拖出兩點距離，Escape 退出量測。':
      'Drag rings from the tray onto the water, or tap a ring and then tap the water. Drag a centre or rim to move a placed ring. Arrow keys nudge the selected ring; in measure mode, drag between two points. Escape leaves measure mode.',
    '請使用支援 Canvas 的瀏覽器。': 'Please use a browser that supports Canvas.', '1 大格 = 1 波長': '1 big square = 1 wavelength', '拖入水面排列': 'Drag onto the water to arrange',
    '5 個圓圈＋波源小鴨': '5 rings + source duck', '全部收回': 'Put all back', '時刻': 'Time', '上一圈': 'Previous ring', '下一圈': 'Next ring', '回到 0 秒': 'Back to 0 s',
    '波源與觀察設定': 'Source and observer settings', '每秒打水 1 下，波速 1 m/s': 'Paddles once a second; wave speed 1 m/s', '¼ 波速': '¼ wave speed', '½ 波速': '½ wave speed', '¾ 波速': '¾ wave speed',
    '向右': 'to the right', '不會自動排列': 'Not arranged for you', '移動圓片': 'Move a ring', '選圓片': 'Ring', '放到這裡': 'Place here', '回原點': 'To origin', '↶ 復原': '↶ Undo',
    '顯示': 'Show', '圓心': 'Centres', '方格': 'Grid', '清除': 'Clear', '按「量距離」後在水面拖曳': 'Tap “Measure”, then drag on the water', '方向鍵移動：': 'Arrow keys move:',
    'A 小鴨（右）': 'Duckling A (right)', 'B 小鴨（左）': 'Duckling B (left)', '小鴨抵達紀錄': 'Duckling arrival log', '進階：自動模擬': 'Advanced: automatic simulation',
    '顯示自動模擬（比對用）': 'Show automatic simulation (to compare)', '取消勾選回到自己的排列': 'Untick to return to your own layout', '波速 c（m/s）': 'Wave speed c (m/s)',
    '打水頻率 f（次/s）': 'Paddle frequency f (/s)', '波源速度／波速': 'Source speed / wave speed', '波源向左': 'Source moves left', '播放速度': 'Playback speed',
    '慢速（0.5×）': 'Slow (0.5×)', '正常（1×）': 'Normal (1×)', '快速（2×）': 'Fast (2×)', '恢復預設': 'Reset to default', '把每一圈的圓心放到發波的位置': 'Put each ring’s centre where it was made',
    '作答': 'Answer', '題目': 'Task', '套用起始設定': 'Apply start settings', '套用這題的起始設定': 'Apply this task’s start settings', '可重送，以最後一次為準': 'You can resend; the last one counts',
    '班級': 'Class', '選班級': 'Class', '座號': 'Seat', '選座號': 'Seat', '組別': 'Group', '姓名': 'Name', '選填': 'optional', '我的回答': 'My answer', '寫下理由': 'Write your reasoning',
    '⇪ 送出給老師': '⇪ Send to teacher', '↓ 下載截圖＋回答': '↓ Download image + answer', '只下載水波圖': 'Download ripple image only', '第 2～4 題會附上水波截圖': 'Tasks 2–4 include a ripple image',
    '本次留下的實驗圖片': 'Images from this session', '實驗紀錄': 'Experiment records', '清除本次紀錄': 'Clear this session', '下載的圖會出現在這裡': 'Downloaded images appear here',
    '教師設定與說明': 'Teacher settings and notes', '收集作答（Google Apps Script）': 'Collect answers (Google Apps Script)',
    '貼上 Apps Script 網址（…/exec），或發給學生 ': 'Paste the Apps Script URL (…/exec), or give students ', 'index.html?gas=網址': 'index.html?gas=URL', '儲存': 'Save', '測試': 'Test',
    '參考：': 'Reference: ', 'OpenStax：The Doppler Effect': 'OpenStax: The Doppler Effect',
    '。截圖會標明是學生手動組合或自動模擬，並保留當時的排列與回答。': '. Images say whether the layout was placed by the student or simulated, and keep the layout and answer.',
    '基本操作是透明片排列：圓片半徑依 5 秒快照給定，圓心由學生自由設定；初始圓片整齊放在旁邊的圓片盤，選擇題目速度不會自動排列。每大格代表靜止波源的 1 個波長（λ = c/f），每大格分成 4 小格；移動時前、後方的波間距用這個基準比較。半徑為 0 的第六片代表波源當下位置，也可以拖動。學生可以嘗試、量測與截圖，任意排列不一定符合實際波源運動。':
      'Students arrange transparent rings: radii are fixed from a 5-second snapshot and students set the centres. The rings start in the tray; choosing a task speed does not arrange them. Each big square is one wavelength of a source at rest (λ = c/f), split into 4 small squares; compare the gaps ahead and behind against it. The sixth ring, radius 0, is the source’s current position and can be dragged. A layout need not match a real moving source.',
    '完成排列後，勾選 A、B 小鴨，按「播放我的排列」就能讓已放好的波前繼續向外擴散。圓心固定，波前抵達小鴨的坐標點時閃光、計次並發出可關閉的呱聲；兩次抵達的間隔可比較接收頻率。次數從播放開始算起，已經越過小鴨的波不再計次；只播放已放好的圓圈，不推測後續波源位置或新增波前。回到原排列即可重排、移動小鴨，再試一次。另可在進階區勾選自動比對，從每次發波位置建立連續波前。忽略反射、衰減、干涉振幅與實際水面波的色散。':
      'After arranging, turn on ducklings A and B and press Play: the placed wavefronts keep spreading with fixed centres. When a front reaches a duckling it flashes, counts and quacks (sound can be turned off); the gap between arrivals gives the received frequency. Counting starts when playback starts, and only placed rings are played. Go back to the layout to rearrange or move ducklings. The advanced section can show an automatic simulation for comparison. Reflection, damping, interference and dispersion are ignored.',
    '預設 t = 0 秒發出第一圈，之後每秒發波一次，因此 5 秒時有五個非零半徑的圓圈，以及剛發出的第六圈（半徑為 0）。相鄰兩圈沿運動方向的間距為 (c − v源)T，反方向為 (c + v源)T。小鴨是固定的點觀察者，圖案大小不代表接收範圍。':
      'By default the first ring is made at t = 0 s and one ring each second after, so at 5 s there are five rings plus a sixth of radius 0. The gap between rings is (c − v)T ahead and (c + v)T behind. Ducklings are point observers; their picture size is not a detection range.',
    'Physics Lab · 都卜勒水波實驗': 'Physics Lab · Doppler Ripple Lab',
    '無法保存，請先下載': 'Could not save; please download first', '請按「試聽」開啟聲音': 'Tap “Test sound” to turn on audio', '已回到排列': 'Back to your layout',
    '呱聲已關閉': 'Quack sound off', '呱聲已開啟': 'Quack sound on', '　（沒聲音？調高音量）': '  (No sound? Turn up the volume)', '無法播放聲音': 'Cannot play sound',
    '我的排列播放 · 目標：': 'Playing my layout · target: ', '手動排列 · 目標：': 'My layout · target: ', '自動模擬 · ': 'Simulation · ', '波源小鴨': 'Source duck',
    '這片已放在水面，可以拖曳圓心或圓周。': 'This ring is on the water; drag its centre or rim.', '已選圓片；在水面點一下放置，或按 Enter 放在中央。': 'Ring selected: tap the water to place it, or press Enter to put it in the middle.',
    '待放置 · ': 'Not placed · ', '當下波源位置（半徑 0）': 'Source now (radius 0)', '當下波源位置': 'Source now', ' 公尺': ' m', '，已放在水面': ', on the water', '，拖入水面或點選後放置': ', drag onto the water or tap to place',
    '自動模擬速度': 'Simulation speed', '拖曳圓圈排列': 'Drag the rings', '自動模擬中': 'Simulating', '發波 t=': 'made t=', '當下 t=': 'now t=', '剛發出 t=': 'just made t=',
    '1 大格 = 1λ = ': '1 big square = 1λ = ', '我的排列 · ＋': 'My layout · ＋', '自己組合 · 5 s': 'My layout · 5 s', '題目：': 'Task: ', '靜止波源': 'source at rest', '（不會自動排列）': ' (not arranged for you)',
    '先勾選「A、B 小鴨」': 'First turn on ducklings A and B', '抵達時刻：': 'Arrival times: ', '還沒有波抵達。': 'No waves have arrived yet.', '速度：': 'Speed: ', '靜止': 'At rest',
    '在水面拖曳量距離': 'Drag on the water to measure', '拖曳 A、B 小鴨': 'Drag ducklings A and B', '已恢復預設': 'Defaults restored', '請輸入 0.5～2': 'Enter 0.5–2', '已更新': 'Updated',
    '已全部收回': 'All rings put back', '已復原': 'Undone', '超出水面，請靠近中央': 'Off the water; move it toward the middle', '已放到 (': 'Placed at (',
    '拖曳時圓心會對齊小格交點；你排好的位置保留。': 'Centres snap to grid points while dragging; your layout is kept.', '可以自由拖曳，或輸入座標精確放置。': 'Drag freely, or type coordinates for exact placement.',
    '抓圓心或圓周拖曳': 'Drag by the centre or rim', '已放好': 'Placed', '已暫停': 'Paused', '：按「▶ 播放」開始': ': press “▶ Play” to start', '（尚未填寫回答）': '(no answer yet)',
    '從我的排列經過 ': 'Elapsed from my layout ', '學生排列的波前向外擴散，圓心固定；次數從開始播放時算起。': 'The placed wavefronts spread out with fixed centres; counting starts when playback starts.',
    '學生手動組合：每個圓心由學生設定，圓片半徑固定。': 'Placed by the student: each centre set by the student, ring radii fixed.',
    '波源早已在打水，水面布滿波；每圈從當時發波的位置擴大，次數從 0 s 算起。': 'The source has been paddling for a while, so the water is full of waves; each ring grows from where it was made, counting from 0 s.',
    '次 · Δt=': '× · Δt=', '1大格=1λ=': '1 big square = 1λ = ', 'm；4小格/大格 · ': ' m; 4 small per big · ', '量測 ': 'Measured ', '未放置量測線': 'No measuring line', '未填班級／座號': 'Class / seat not filled in',
    '再下載': 'Download again', '已下載': 'Downloaded', '已清除紀錄': 'Records cleared', '播放完畢': 'Finished', '已到 10 秒': 'Reached 10 s', '已移除一隻小鴨': 'Removed a duckling',
    '✕ 結束示範': '✕ End demo', '示範：波源每秒打水一次，邊走邊發波': 'Demo: the source paddles once a second while moving', '回到自己的排列': 'Back to your own layout',
    '小鴨以 0.5 倍波速向左游：A 迎著波、B 順著波': 'Ducklings swim left at 0.5 × wave speed: A into the waves, B with them', '小鴨停止游動': 'Ducklings stopped',
    '3D 載入中…': 'Loading 3D…', '這台裝置無法顯示 3D': 'This device cannot show 3D', '3D：拖曳旋轉、雙指縮放；排列請回 2D': '3D: drag to rotate, pinch to zoom; switch to 2D to arrange',
    '3D：拖曳旋轉，兩指縮放；排圓片請回 2D': '3D: drag to rotate, pinch to zoom; switch to 2D to place rings', '3D 水面：拖曳旋轉，雙指或滾輪縮放': '3D water: drag to rotate; pinch or scroll to zoom',
    '怎麼操作': 'How to', '收合': 'Collapse', '✎ 作答': '✎ Answer', '← 回操作': '← Back', '控制': 'Controls', '⛶ 隱藏網址列': '⛶ Hide address bar', '✕ 顯示網址列': '✕ Show address bar',
    '怎麼看': 'What to look for', '小鴨與工具': 'Ducklings and tools', '更多設定': 'More settings', '波速、頻率、圓心、復原…': 'Wave speed, frequency, centres, undo…', '即時讀值': 'Live readings',
    '填寫身分': 'Your details', '先填好你的身分': 'Fill in your details first', '整節課都用這個，送出作答時會自動帶入。': 'You’ll use these all lesson; they are added to every answer you send.',
    '組別（一組 3 人）': 'Group (3 per group)', '開始': 'Start', '✎ 先填身分': '✎ Your details', '還沒填完：': 'Still missing: ',
    '從「圓片」把圓圈一片一片拖進水面': 'Drag the rings from “Rings” onto the water one by one',
    '把每一圈的圓心放到它發波時波源的位置（水平線上的 1～5 刻度）': 'Put each ring’s centre where the source was when it made that ring (marks 1–5 on the line)',
    '打開「🦆 小鴨」，按「▶ 播放」，聽誰被打得比較頻繁': 'Turn on “🦆 Ducklings”, press “▶ Play”, and listen: who gets hit more often?',
    '水面早已布滿波：波源一邊往前走、一邊每秒發出一圈': 'The water is already full of waves: the source moves forward and makes a ring every second',
    '比較前方和後方相鄰兩圈的距離；聽每隻小鴨誰叫得比較密': 'Compare the gaps between rings ahead and behind; listen to which duckling calls more often',
    '換「波源速度」再看一次；按「✕ 結束示範」回到自己排': 'Change “Source speed” and look again; press “✕ End demo” to go back to your own layout',
    '波源不動，小鴨以 0.5 倍波速向左游': 'The source stays still; the ducklings swim left at 0.5 × wave speed',
    'A 迎著波游、B 順著波游：聽誰叫得比較密': 'A swims into the waves, B with them: listen to who calls more often',
    '看「即時讀值」：每秒被打幾次？波長有沒有變？': 'Check “Live readings”: hits per second? Did the wavelength change?',
    '自己排': 'My layout', '示範中': 'Demo', '觀察者動': 'Moving observer', '未完成': 'Unfinished', '正確': 'Correct', '圓心沒有移動': 'Centres did not move', '方向相反': 'Wrong direction', '圓心間距不一致': 'Uneven spacing of centres',
    '波源 ': 'Source ', ' 的水波': ' ripples', '帶入': 'Fill in', '請先量距離': 'Measure first', '請先播放，等收到兩圈': 'Play first and wait for two rings', '已帶入 ': 'Filled in ',
    '（未填）': '(blank)', '排列檢查：': 'Layout check: ', '（未填寫）': '(blank)', '老師端回覆錯誤': 'The teacher’s server returned an error', '尚未設定收集網址，請用下載': 'No collection URL yet; please download instead',
    '請先在左上角填好班級、組別、座號': 'Fill in class, group and seat first (top left)', '還沒作答': 'No answer yet', '水波還沒排完（': 'The ripples are not finished (', '），仍要送出？': '). Send anyway?',
    '傳送中…': 'Sending…', '✓ 已送出（': '✓ Sent (', '沒送出，請再按一次': 'Not sent; please try again', '目前會送到：': 'Currently sends to: ',
    '尚未設定，學生按「送出給老師」會提示改用下載。': 'Not set; students who press “Send to teacher” will be asked to download instead.',
    '網址格式應為 https://script.google.com/macros/s/…/exec': 'The URL should look like https://script.google.com/macros/s/…/exec', '已儲存在這台裝置。發給學生的連結：': 'Saved on this device. Link for students: ',
    '已清除。': 'Cleared.', '請先貼上網址。': 'Paste a URL first.', '測試中…': 'Testing…', '✓ 連線成功：': '✓ Connected: ', '連線有回應，但內容不正確。': 'The server answered, but not as expected.',
    '無法讀取回覆。請確認部署時「誰可以存取」選「任何人」，網址是 /exec 結尾。': 'Could not read the reply. Check the deployment allows “Anyone” and the URL ends in /exec.',
    '向右移動': 'moving right', '向左移動': 'moving left', '誰跑得最快？': 'Who is fastest?', '看天鵝與小鴨的照片：哪一隻跑得最快？': 'Look at the photo of swans and ducks: which one is fastest?',
    '理由': 'Reason', '最快的是': 'Fastest one', '例：右下的天鵝': 'e.g. the swan at the bottom right', '判斷依據': 'I judged by', '你是看什麼判斷的？': 'What did you look at to decide?', '前密後疏': 'Crowded ahead, spread behind', 'V 字波較長': 'Longer V-shaped wake',
    '身體姿勢': 'Body posture', '其他': 'Other', '靜止打水': 'Paddling in place', '原地每秒打水 1 下，排出 5 秒時的水波。': 'A duck paddles in place once a second. Place the ripples at 5 s.',
    '最外圈在第幾秒發出？': 'When was the outer ring made?', '移動波源': 'Moving source', '每人負責一種速度：排出 5 秒的水波，量前、後方相鄰兩圈的間距。': 'One speed each: place the ripples at 5 s and measure the gaps between rings ahead and behind.',
    '發現': 'What I found', '我的速度': 'My speed', '前方間距（m）': 'Gap ahead (m)', '後方間距（m）': 'Gap behind (m)', '水波速度會？': 'The wave speed…', '變快': 'increases', '不變': 'stays the same', '變慢': 'decreases',
    '誰被打得多？': 'Who gets hit more?', '波源 ½ 波速向右。先預測，再播放，記下 A、B 被打到的間隔。': 'The source moves right at ½ wave speed. Predict, then play and record the gaps between hits for A and B.',
    '和間距的關係': 'Link to the gaps', '預測': 'Prediction', 'A 較頻繁': 'A more often', 'B 較頻繁': 'B more often', '一樣': 'Same', 'A 間隔（s）': 'A gap (s)', 'B 間隔（s）': 'B gap (s)',
    '觀察者移動': 'Moving observer', '按「套用起始設定」再按「▶ 播放」：波源靜止，小鴨以 0.5 倍波速向左游。記下 A（迎著波）、B（順著波）每秒被打幾次。':
      'Press “Apply start settings”, then “▶ Play”: the source is still and the ducklings swim left at 0.5 × wave speed. Record hits per second for A (into the waves) and B (with the waves).',
    '頻率為什麼變？': 'Why does the frequency change?', 'A 迎著波：每秒幾次': 'A into the waves: hits per second', 'B 順著波：每秒幾次': 'B with the waves: hits per second', '波長會？': 'The wavelength…',
    '變短': 'gets shorter', '變長': 'gets longer', '出口票': 'Exit ticket', '判斷 A～D 波源的運動。': 'Work out how the source moves in A–D.', '理由（用波長、波速）': 'Reason (use wavelength and wave speed)',
    'B、C 誰快？': 'Faster: B or C?', 'B 快': 'B', 'C 快': 'C', '波源向右，誰收到的頻率高？': 'Source moving right: who receives the higher frequency?', '前方': 'Ahead', '後方': 'Behind',
    '呱': 'Quack', '嗡': 'Buzz', '叮': 'Ding', '啾啾': 'Tweet', '吱': 'Squeak', '咚': 'Dong',
    '波源': 'source', ' 波速': ' wave speed', '圈 ': 'Ring ', '圓片 ': 'Ring ', ' · 半徑 ': ' · radius ', '圓心：(': 'Centre: (', '，半徑 ': ', radius ', '波源速度': 'Source speed', ' 小鴨': ' duckling',
    '經過 ': 'Elapsed ', '收到 ': 'Hits ', '間隔 ': 'Gap ', ' s（每秒 ': ' s (', ' 次）': ' per s)', ' 次': '', '頻率 ': 'Frequency ', ' 次/s': ' /s', '抵達 ': 'Arrivals ', '距離 ': 'Distance ',
    ' 題設定': ' settings', ' 題': '', '第 ': '', ' 班': '', ' 號': '', ' 組': '', '班 ': ' · ', '組 ': ' · ', '號': '',
    '右': 'right', '左': 'left', '「': '“', '」': '”', '、': ', ', '，': ', ', '：': ': ', '！': '!', '（': ' (', '）': ')', '　': ' ', '？': '?', '；': '; ', '。': '.', '～': '–', '／': '/'
  };
  const KEYS = Object.keys(EN).sort((a, b) => b.length - a.length);
  const memo = new Map();
  let lang = 'zh';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    lang = q === 'en' || q === 'zh' ? q : (localStorage.getItem('doppler-lang') || 'zh');
    if (q) localStorage.setItem('doppler-lang', lang);
  } catch (_) { /* 無法存取時預設中文 */ }

  function tr(s) {
    if (lang !== 'en' || !s || !CJK.test(s)) return s;
    if (memo.has(s)) return memo.get(s);
    let out = EN[s.trim()] !== undefined ? s.replace(s.trim(), EN[s.trim()]) : s;
    if (CJK.test(out)) for (const [re, to] of RULES) out = out.replace(re, to);
    if (CJK.test(out)) for (const k of KEYS) { if (out.includes(k)) { out = out.split(k).join(EN[k]); if (!CJK.test(out)) break; } }
    memo.set(s, out); return out;
  }
  window.T = tr;

  // 文字節點與屬性：記住原本的中文，切換時可以換回來
  const textRec = new WeakMap(), attrRec = new WeakMap();
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const SKIP = el => el && el.closest && el.closest('script,style,textarea,[data-no-i18n]');
  function doText(n) {
    if (SKIP(n.parentElement)) return;
    const cur = n.nodeValue, rec = textRec.get(n);
    let zh = rec && cur === rec.out ? rec.zh : cur;
    if (!rec && !CJK.test(cur)) return;
    const want = tr(zh);
    textRec.set(n, { zh, out: want });
    if (want !== cur) n.nodeValue = want;
  }
  function doAttrs(el) {
    if (el.closest && el.closest('[data-no-i18n]')) return;
    let recs = attrRec.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a), rec = recs && recs[a];
      const zh = rec && cur === rec.out ? rec.zh : cur;
      if (!rec && !CJK.test(cur)) continue;
      const want = tr(zh);
      recs = recs || {}; recs[a] = { zh, out: want }; attrRec.set(el, recs);
      if (want !== cur) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = it.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let titleZh = null;
  function apply() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hant';
    if (titleZh === null) titleZh = document.title;
    document.title = tr(titleZh);
    walk(document.body);
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.querySelectorAll('#lang-toggle, [data-lang-toggle]').forEach(t => { t.textContent = lang === 'en' ? '中文' : 'EN'; });
  }
  function setLang(next) {
    if (next === lang) return;
    lang = next; memo.clear();
    try { localStorage.setItem('doppler-lang', lang); } catch (_) { /* 只影響本次 */ }
    apply();
    window.dispatchEvent(new CustomEvent('doppler:lang', { detail: lang }));
  }
  window.DopplerLang = { get: () => lang, set: setLang };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-lang], #lang-toggle, [data-lang-toggle]'); if (!b) return;
    setLang(b.dataset.lang || (lang === 'en' ? 'zh' : 'en'));
  });
  function start() {
    apply();
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
