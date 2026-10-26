# 棒球氣流實驗室：資料與模型依據

入口維持 `apps/baseball-cfd/index.html`。所有數值換算、邊界層、受力、流場與投球積分在瀏覽器 JavaScript／Web Worker 執行；不需要 Python、後端計算或外部 CDN。

## 個案資料與來源

`mlb_data.js` 保存 MLB Baseball Savant 2025-06-01 例行賽八顆右投個案的原始欄位、下載網址、來源 CSV 的 SHA-256、投手、球種、比賽／打席／球序與選取方法。這些是單球範例，不是 MLB 平均或典型球種參數。四縫線預設為 Justin Martinez 當日第 66 打席第 1 球，101.1 mph、2324 rpm、出手 x = −2.67 ft、y = 53.99 ft、z = 6.04 ft；其他球種選取規則見每筆資料。

可從資料內的 `source_url` 重新下載至 `scratch/statcast-2025-06-01.csv`，執行 `node tools/baseball-mlb-presets.cjs` 重建觀測資料。此步只整理公開觀測欄位，不預算流場或軌跡。

## 座標與出手條件

依 [MLB 欄位定義](https://baseballsavant.mlb.com/csv-docs)，採捕手視角：x 向捕手右方、y 向投手丘、z 向上，長度由 ft 轉 m。2025 及以前的進壘點位於本壘前緣 y = 17/12 ft；2026 起已改用本壘中線，故本資料集刻意固定於 2025，不能直接混用。

`vx0/vy0/vz0` 是 y = 50 ft 處的速度，並非出手速度。`mlb.js` 用常加速度追蹤擬合解 `50 + vy0*t + ay*t²/2 = release_pos_y`，取靠近 0 的負根作出手時刻，再由 `v_release = v50 + a*t_release` 求仰角 `asin(vz/|v|)`、偏角 `atan2(vx,−vy)`。用原始 release_pos_x/z 建立參考軌跡；原始 release_pos_y 優先於已四捨五入的 extension 欄位。不再另外加上投手丘高度。

模型使用報告的 release_speed（精度 0.1 mph）與回推方向，參考擬合使用完整速度向量；二者的微小速度差另列於驗證報告。好球帶上下緣採每球的 sz_bot/sz_top，寬度 17 in，不再固定所有打者為 18–42 in。

預設關閉自動瞄準。教學瞄準可另外反算初速方向，使模型通過指定目標；四組模型仍共用同一初速。這不是實際投手的動作資料，也不能拿瞄準誤差宣稱模型通過實測驗證。

## 旋轉、阻力與縫線

### 預設：MLB 總氣動力推演

由追蹤資料估計有效 CD、總橫向係數與橫向力方向，再以 `F = rho*A*V_relative²/2 * (−CD*v_hat + C_transverse*n_hat)` 積分，重力另加；橫向方向每步投影至當下相對速度的垂直平面。不把總橫向力宣稱為純 Magnus，也不再疊加假設縫線力。旋轉與縫線參數在此模式停用，避免假造實測拆分；仍可調整出手位置、速度與環境，固定係數的外推範圍有限。

這是由同一顆球運動約束的降階推演，不是完整 CFD。八顆個案的名義環境進壘一致性誤差約 0.4–1.7 in；這不是樣本外預測精度，亦不等於實際氣象已知。風洞皮革、縫線、分離線及煙霧仍屬機制示意，不能當成這顆球的量測流場。

### 可選：旋轉／縫線機制模型

- 總轉速與 x-z 旋轉軸投影使用觀測值。完整三維轉軸不是逐球公開欄位。[Nathan 2024](https://baseball.physics.illinois.edu/HawkeyeAveSpinComponents.pdf) 說明此缺失；`spinVector` 依其 Eq. 4 在固定 x-z 投影下求缺失分量，仍依賴推估的主動旋轉比及右投陀螺方向假設。
- 依 [Hall & Nathan 2009](https://baseball.physics.illinois.edu/LiftDrag-1.pdf)，先從追蹤加速度扣除重力，再沿中段速度方向投影，估計阻力與橫向加速度。以名義 20°C、RH 50%、1013.25 hPa 的空氣密度換算有效 CD 及 CL。這不是當日實測氣象，CD 會與假設的密度耦合。
- 網頁使用 [Nathan 2020](https://baseball.physics.illinois.edu/trackman/SpinAxisAddendum.pdf) Eq. 10 的 prescription b：`CL = 0.336 * (1 - exp(-6.041 * S_perp))`。主動旋轉比由總橫向加速度反推，因此可能含 SSW，不能當成直接量測的 spin efficiency。該文也比較另一種 gyro prescription，兩者並非所有情況都等價。
- 資料推估的有效 CD 在環境變化時保持固定，不隨新密度重新反推，以免抵消環境效果。該 CD 已含該球表面與尾流的總作用；模型對照的「無縫線」只代表移除額外方向性縫線增量，不能稱為真實光滑球的觀測。
- 接縫曲線、相位、高度、轉捩與分離判準仍是降階模型假設。[Garrett & Smith 的實驗資料](https://digitalcommons.usu.edu/all_datasets/191/) 支持縫線可提前或延後分離，並可在 Magnus 及非 Magnus 方向改變力；它不提供本頁每顆 MLB 球的縫線初始位置或通用力係數。

因此，旋轉／縫線的四組差異是模型內的假設拆分；不能由目前資料唯一辨認實際 Magnus 與 SSW 的個別貢獻。108 組雙縫針是幾何顯示，沒有逐針求解局部流場。

## 環境如何進入計算

空氣密度以乾空氣與水蒸氣的分壓理想氣體式計算；飽和水蒸氣壓用 [NCAR 彙整的 Buck 1996 式](https://www.eol.ucar.edu/data-software/conventions-and-standards/water-vapor-pressure-formulations)。黏滯係數使用 [NASA 說明的 Sutherland 關係](https://www.grc.nasa.gov/www/k-12/airplane/viscosity)。`nu = mu/rho` 進入 Reynolds 數與邊界層判準。

未指定測站氣壓時，以海拔和標準大氣估壓；指定測站氣壓時直接使用，不再套用海拔壓力修正。不得把海平面校正氣壓誤當成測站氣壓。濕度影響僅為氣相密度，不模擬球皮長時間吸濕。

每個 RK4 子步都用 `v_relative = v_ball - v_wind` 計算阻力、升力及 Reynolds 數。風速單位 m/s；+x 為風往捕手右方，+y 為風往投手丘（對來球是逆風）。初速與重力保留地面座標，風不直接加到球的初速。預設氣象是可設定的名義條件，不冒充比賽當日實測。

## 對照與驗證

紫色軌跡為官方九參數常加速度擬合，隨模型或環境改變保持固定。紅色為所選受力模型；頁面直接顯示其與官方 plate_x/plate_z 的差距。擬合重建的毫米級一致性只檢查座標換算，不能驗證空氣動力學。有效 CD 與主動旋轉比亦由同球運動估計，屬個案一致性檢查，並非獨立校準或樣本外驗證。機制模式對這八顆球仍約有 2.5–7.2 in 的差距，沒有宣稱已精準還原其縫線力。

`node --test tests/baseball-cfd.test.js` 驗證原始資料、50 ft 至出手換算、八顆球進壘重建、旋轉軸投影、公式極限、氣壓／溫度／濕度／風的物理響應與顯示不改動物理結果。`node tests/baseball-cfd.browser.test.cjs`（需 Playwright）驗證真正 Worker、資料預設、MLB 參考保持固定、環境改變保留出手方向、瞄準切換、3D 操作與 320–1440px 版面。

目前尚不能宣稱逐球精準預測：缺少完整三維轉軸、縫線相位、實際氣象與球的個體差異。文獻與資料來源用來約束設定與揭露誤差，不能代替這些缺失的量測。
