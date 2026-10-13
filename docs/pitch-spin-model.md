# SPIN 投球旋轉實驗室：模型說明

入口：`apps/pitch-spin/index.html`（three.js 3D）、`apps/pitch-spin/vpython.html`（GlowScript／VPython）、`notebooks/baseball_aerodynamics.ipynb`（Colab）。三者使用同一套軌跡物理；`pitch_spin_vpython.py` 是可直接在 Web VPython 或 `pip install vpython` 執行的 Python 版本。

## 座標與輸入

- 捕手視角：x 往一壘側、y 由本壘指向投手丘、z 往上。出手點 (∓0.55, 16.7, 1.78) m（右投在三壘側），本壘板前緣 y = 0.432 m。
- 轉速 rpm、球速 km/h、有效旋轉比例 e、轉軸時鐘方向（tilt，從投手背後看旋轉把球推去的方向；12:00 = 純後旋）。
- 旋轉向量：ω = ω e ω̂⊥ + ω √(1−e²) s v̂，其中 ω̂⊥ = v̂ × m̂（m̂ 為時鐘方向），s 為陀螺方向（右投 +1、左投 −1，角速度是偽向量，左右鏡像時陀螺方向相反）。
- 縫線方位：四縫線／二縫線只影響 3D 外觀；經典棒球縫線曲線 a = 4/13，四縫線轉軸取曲線的 z 軸（每轉 4 段縫線劃過），二縫線取 (−1, 1, 0)/√2（每轉 2 段）。

## 力與積分

- 重力 g = 9.80665 m/s²；阻力 ½ρAC_D v²，C_D = 0.33；ρ = 1.2 kg/m³，m = 0.145 kg，r = 3.66 cm。
- 馬格努斯力 ½ρAC_L v²，方向 ω⊥ × v；C_L = 1/(2.32 + 0.4/S)，S = r|ω⊥|/v（Sawicki, Hubbard & Stronge 2003）。ω⊥ 是相對於「當下」速度的垂直分量，所以純陀螺旋轉在球路彎曲後也會出現少量有效旋轉。
- 轉軸在飛行中固定（不計旋轉衰減），RK4，Δt = 0.5 ms，穿越本壘前緣時線性內插。
- 出手方向自動調整，讓這顆會旋轉的球通過好球帶中心 (0, 0.76 m)；「不轉的球」用同樣的出手速度與方向但關掉馬格努斯力。兩者在本壘的差就是旋轉造成的位移（從出手點起算，捕手視角）。

## 預設球種

右投手的典型轉速與轉軸。這個 C_L 式對慢速、高轉速的變化球可能高估，所以有效旋轉比例取得比 Statcast 報告值保守，使模型位移接近近年大聯盟平均（誤差 < 10 cm，見 `tests/pitch-spin.test.js`）。伸卡球、變速球的實際位移還包含縫線偏移尾流（SSW），本模型未計入。

## 限制

不含縫線偏移尾流、旋轉衰減、風、海拔（可改 ρ）與球的個體差異。二維 CFD（`apps/baseball-cfd`、筆記本第 3 部分）用來定性看見旋轉與縫線如何讓尾流偏移，不能取代真球的升力係數。

## 測試

`node --test tests/pitch-spin.test.js`：C_L 公式、無旋轉時與不轉的球一致、瞄準命中、阻力造成的減速與飛行時間、時鐘方向與位移方向、陀螺旋轉、左右鏡像、預設球種與平均值的差距。VPython 程式的物理以 CPython 替身模組驗證，與 `pitch.js` 的位移到 0.01 cm 一致。

## 第三方程式

- three.js r160（MIT），`apps/pitch-spin/lib/three.min.js`，已移除載入時的棄用警告。
- GlowScript 函式庫（隨 `vpython` 7.6.5 套件發佈，MIT），`apps/pitch-spin/lib/glow/`，含 jQuery 與 jQuery UI。
