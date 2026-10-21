# BARREL 全壘打仰角與空氣阻力實驗室：模型說明

入口：`apps/barrel-angle/index.html`（Three.js 3D 夜間球場 + 2D 仰角與相圖分析）。核心物理模組：`apps/barrel-angle/barrel-physics.js`。

## 座標與輸入

- 平面座標 $(x, y)$：$x$ 由本壘板指向中外野（公尺，落在本壘後方時 $x < 0$），$y$ 為離地高度（公尺，擊球點 $x = 0, y = 1.0\text{ m}$）。
- 輸入參數：
  - 打球初速 $v_0$（km/h，對應 Statcast Exit Velocity）
  - 打球仰角 $\theta \in [0^\circ, 90^\circ]$（Launch Angle，完整涵蓋平飛球、飛球與 $60^\circ\text{–}90^\circ$ 沖天炮）
  - 後旋轉速 $\text{rpm}$（正值為後旋 Backspin，負值為上旋 Topspin）
  - 空氣阻力係數 $C_D$（預設 $0.398$）
  - 海拔高度 $h$（以國際標準大氣公式計算空氣密度 $\rho(h) = 1.225 (1 - 2.25577\times 10^{-5} h)^{4.25588}\text{ kg/m}^3$）
  - 外野風速 $v_w$（正值為順風，負值為逆風）

## 力與數值積分（RK4）

棒球質量 $m = 0.145\text{ kg}$、半徑 $r = 3.66\text{ cm}$、截面積 $A = \pi r^2$、重力加速度 $g = 9.80665\text{ m/s}^2$。相對風速 $\vec{v}_{\text{rel}} = (v_x - v_w,\, v_y)$，速率 $v_{\text{rel}} = |\vec{v}_{\text{rel}}|$。

1. **二次空氣阻力**：
   $$\vec{F}_D = -\frac{1}{2}\rho A C_D v_{\text{rel}} \vec{v}_{\text{rel}}$$
2. **後旋馬格努斯升力**：
   $$\vec{F}_M = \frac{1}{2}\rho A C_L(S) v_{\text{rel}} (-v_{\text{rel},y},\, +v_{\text{rel},x}), \quad C_L(S) = \frac{S}{0.385 + 2.22 S}, \quad S = \frac{r|\omega|}{v_{\text{rel}}}$$
3. **三模型同場對照**：
   - **真實空氣動力（阻力＋後旋）**：在 $158\text{ km/h}$ 下，$10^\circ \to 83\text{ m} / 2.6\text{ s}$（平飛安打，因後旋升力超越真空的 $72\text{ m}$）、$28^\circ \to 114\text{ m} / 5.0\text{ s}$（全壘打）、$45^\circ \to 103\text{ m} / 6.3\text{ s}$（外野高飛接殺）。
   - **僅空氣阻力（無旋轉）**：無馬格努斯升力，最佳仰角約 $39^\circ\text{–}40^\circ$。
   - **真空無阻力**：理想拋物線，最佳仰角 $45^\circ$（在 $158\text{ km/h}$ 可飛 $197\text{ m}$）。

## 60°～90° 沖天炮與逆向迴旋效應（Paradoxical Pop-Up）

當仰角位於 $60^\circ\text{–}90^\circ$ 時：
- 上升階段 $v_y \gg v_x$，後旋馬格努斯力水平分量 $F_{M,x} \propto -v_y < 0$ 將球推向本壘板後方。
- 由於上升初速（$43.9\text{ m/s}$）顯著大於下降終端速度（約 $28\text{ m/s}$），上升段向後的馬格努斯衝量勝過下降段向前的衝量，使軌跡在最高點產生折返迴圈：約 $83^\circ$ 時球會繞一圈落回本壘板（$x \approx 0$），而 $85^\circ\text{–}90^\circ$ 則會落在本壘後方界外區（$x \approx -7\text{ m} \sim -22\text{ m}$）。

## MLB Statcast Barrel（バレル / 甜蜜區）定義

- 最低初速門檻：$98\text{ mph}$（約 $158\text{ km/h}$），對應仰角範圍 $26^\circ\text{–}30^\circ$（僅 $4^\circ$ 寬）。
- 隨初速提升線性擴張：$100\text{ mph}$（$161\text{ km/h}$）為 $24^\circ\text{–}33^\circ$（$9^\circ$ 寬）；$116+\text{ mph}$（$187\text{ km/h}$）擴張至 $8^\circ\text{–}50^\circ$（$42^\circ$ 寬）。

## 測試

`node --test tests/barrel-angle.test.js`：驗證 MLB Barrel 門檻與擴張、IG 影片 $10^\circ/28^\circ/45^\circ$ 基準數據、$60^\circ\text{–}90^\circ$ 沖天炮與後旋倒退效應、$0^\circ\text{–}90^\circ$ 三模型最佳仰角偏移，以及海拔與順逆風影響。
