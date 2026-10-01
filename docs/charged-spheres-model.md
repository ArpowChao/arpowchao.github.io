# 固定均勻帶電實心球：模型、積分與驗證

本 app 使用固定、均勻的**體電荷分布**。兩球沒有極化，電荷密度不隨彼此距離改變。介質為真空，球心距 d 大於兩球半徑之和。所有 API 使用 SI 單位。

## 精確結論

兩個不重疊、球對稱的電荷分布，其總靜電力精確等於把各球總電荷放在球心後的點電荷力：

    F_B,x = k Q_A Q_B / d²

正值是右球 B 向右受力（排斥），負值是向左受力（吸引）。距離 d 是**球心距**，不是球面間隙。這個結論在球面很靠近時仍成立；不需要遠距離假設。

近側電荷元素受力較大，但不能只比較最近的一對電荷。必須把全部電荷元素的三維向量力相加。靠近時局部場更加不均勻，總和卻仍是上述精確結果。

依高斯定律，球對稱電荷在球外的場等同於球心點電荷。球 A 的外部電位在整個不重疊的球 B 內沒有源，滿足拉普拉斯方程，因此在 B 的每個同心球面上，電位平均值等於 B 球心的電位。對所有球殼積分可得交互作用能：

    U_interaction = ∫_B ρ_B V_A dV = Q_B V_A(x_B) = k Q_A Q_B / d
    F_B,x = -dU_interaction/dd = k Q_A Q_B / d²

這段兩球總力推導結合球殼定理與調和函數平均值性質；不是把非均勻的局部電場直接當成均勻場。球外點電荷等效、均勻實心球內外場及電位可核對 [MIT 8.02 高斯定律教材，Example 4.4 與 §4.8.4](https://web.mit.edu/8.02t/www/802TEAL3D/visualizations/coursenotes/modules/guide04.pdf)。

## 內外場與電位

每球總電荷 Q、半徑 R，固定體電荷密度為：

    ρ = 3Q / (4πR³)

設 r 向量由該球球心指向測量點：

    球內：E = kQ r_vector / R³
    球外：E = kQ r_vector / |r_vector|³

以無限遠電位為零：

    球內：V = kQ(3R²-r²) / (2R³)
    球外：V = kQ/r

兩球場與電位用疊加得到。球心的本球電場為零、電位有限，球面兩側的場與電位連續。這些式子也列於 [MIT 電位講義，第 43–45 頁](https://ocw.mit.edu/courses/8-02-physics-ii-electricity-and-magnetism-spring-2007/ae0d9b601b83812b25ed6a4fb0c19a03_presentati_w02d2.pdf)。

## API

模組同時提供瀏覽器全域 ChargedSpheresPhysics 與 Node CommonJS，可直接以 script 載入，不需套件或網路。

- solve({ radius, separation, q1, q2 })：共同半徑，也可改用 radiusA、radiusB。separation 是球心距；回傳 centers=[-d/2,d/2]、radii、volumeDensities、force、coulombForce、interactionEnergy 等。
- fieldAt(solution, x, y)：回傳總場 ex、ey、potential，及 inside、sphere。x、y 亦作為場分量別名；不是輸入座標的重複值。
- sampleForce(solution, x, y)：回傳 A 的場，以及 B 在該位置的局部作用力密度 forceDensityX、forceDensityY（N/m³）。rho 在 B 體內為固定值，體外為零；不包含 B 的自場。
- sliceAt(solution, u, order=12)：u=(x-x_B)/R_B，範圍 [-1,1]。回傳圓盤切片的 chargePerU（C）、forcePerU（N）以及平均 fieldX。以上為每單位 u 的密度，乘上 du 才是薄切片電荷與力。
- integrateForce(solutionOrParams, order=12)：回傳獨立體積積分的 numericalForce（亦名 force）、exactForce、relativeError、absoluteError、samples、slices、nearForce、farForce、integratedCharge。
- directSumForce(solutionOrParams, gridSize=7)：兩球都離散成體電荷點，逐對加總三維庫倫力，回傳 numericalForce（亦名 force）、forceY、forceZ、pointsA、pointsB、pairs、pointCount（兩球合計）、pointsPerSphere、pointCounts、slices、nearForce、farForce 與誤差。gridSize 必須是 3–15 的奇數。
- axisPairs(solutionOrParams, gridSize=7)：從相同三維格心點集篩選**水平連心軸（y=z=0）上的點**，取近側兩端與遠側兩端，回傳水平最近／最遠的一對 near、far。每對含 points=[A,B]（各點 x、y、z、q）、distance、非負力大小 force、有號力大小 signedForce（正為排斥）與 B 的力向量 forceVector（僅 x 分量）。forceRatio=|f_near|/|f_far|=(r_far/r_near)²；任一球電荷為零時回傳 null。comparisonAxis='x'、axisPointCounts 與 selection 註明比較範圍；pointsPerSphere、pointCounts 仍計算完整三維點集，點電荷也按完整球的點數分配。gridSize 的限制同 directSumForce。

integrateForce 的 slices 每項含 u、x、charge、force、fieldX、weight；charge 與 force 已乘 Gauss 積分權重。若以等寬長條呈現切片分布，應呼叫 sliceAt 的 forcePerU，避免把不同的 Gauss 權重誤當成物理密度。

solve 的 energy 含實心球固定自能 3kQ²/(5R) 及交互作用能；interactionEnergy 僅為兩球交互作用部分。centerPotentials 是兩個球心的總電位。

q1*q2=0 時總交互作用力為零。零基準無法定義力比值，因此 ratio 與積分 relativeError 回傳 null，absoluteError 仍為零。

## 兩球逐對庫倫加總

主要演算 directSumForce 完全不使用球外場公式來求力。它在每球的外接立方體上建立 m×m×m 等距網格，取每個小立方體的中心；保留球內中心點，假設這些點代表相等的小體積。球 A 每點電荷為 Q_A/N_A，球 B 每點電荷為 Q_B/N_B。

對每一對不同球的體電荷點，以真正的三維距離計算：

    delta = r_B,j - r_A,i
    f_ij = k (Q_A/N_A)(Q_B/N_B) delta / |delta|³
    F_B = Σ_i Σ_j f_ij

每球總電荷精確保持指定值。規則網格關於 y、z 對稱，因此橫向力相消。沿 x 軸逐層累加的 slices 每項包含 u=(x-x_B)/R_B、force、charge、pointCount；這些是真實點對加總結果，不是由精確公式倒推。位在 B 中心平面的點，其力各分一半給近、遠半球。

水平最近／最遠點對比較使用每個格心的相等點電荷，因此距離較近的一對力較大，力大小比由反平方律直接給出。這是**單一點對**的局部比較，不能以該比值推斷兩球總力大於球心公式。比較的四個點都位於水平連心線，y=z=0，最遠一對為 A 球最左與 B 球最右的軸上格心；篩選端點即可，無需遍歷全部跨球點對。完整總力仍加總所有三維點對。

格心位於球內，不在球面。每軸分割為奇數 m 時，軸上端點離球心的距離是 R(1−1/m)。令 δ=(R_A+R_B)(1−1/m)，可得：

    r_near = d − δ
    r_far = d + δ
    |f_near|/|f_far| = [(d+δ)/(d−δ)]²

同半徑時 d=g+2R，因此 r_near=g+2R/m，大於球面間隙 g。當 d 遠大於半徑，δ/d 變小，兩個距離相對於 d 的差異也變小；力大小比趨近 1。app 的間隙可拉至 g/R=2000，讓學生看到這個趨勢。這個遠距離趨勢描述**局部點對的力逐漸接近**；連續均勻球的**總力**在所有不重疊距離本來就等於球心公式。

畫面始終使用單一物理比例：半徑、球心距、間隙與格心位置乘上同一個比例因子。觀看控制可縮放 0.25～1024 倍並拖曳平移，不改變物理參數或計算結果；「顯示全貌」恢復置中，「看球 A／B」把視野移到該球。距離很遠時，全貌中的球會按真實比例縮小，不設定最小球半徑或壓縮間距；可聚焦單球查看。字樣、電荷標記與方向箭頭是註記，不代表物理尺寸，球太小時暫不顯示電荷標記。

例如 m=7、R=0.03 m、Q_A=Q_B=5 nC、g/R=2000 時，d=60.06 m，每球有 179 個格心電荷點：

| 比較量 | 水平最近點對 | 水平最遠點對 |
| --- | ---: | ---: |
| 距離 | 60.00857143 m | 60.11142857 m |
| 單一點對力大小 | 1.94737135×10⁻¹⁵ N | 1.94071273×10⁻¹⁵ N |

最近／最遠力大小比為 1.00343102，差異約 0.3431%。同時全部 32,041 點對加總約為 6.22889140×10⁻¹¹ N，與球心公式相同至列示精度。

**有限網格不是連續均勻球的精確表示**。球邊界的小立方體有些跨出球面、有些只有部分落在球內；本方法用中心是否在球內來取捨，再重新正規化電荷。點集只有立方網格的對稱性，沒有連續球的所有旋轉對稱性，因此其力可以比球心公式大或小。這個差異是有限分割誤差，不是均勻連續球在近距離偏離庫倫球心公式。

同半徑、g/R=0.05 的雙球逐對加總結果：

| 每軸分割 m | 每球體電荷點 | 點對數 | 力大小相對球心公式偏差 |
| --- | ---: | ---: | ---: |
| 3 | 19 | 361 | −1.3086% |
| 5 | 81 | 6,561 | −0.3492% |
| 7 | 179 | 32,041 | +0.8771% |
| 9 | 389 | 151,321 | +0.4716% |
| 11 | 739 | 546,121 | +0.5056% |
| 13 | 1,189 | 1,413,721 | +0.20035% |
| 15 | 1,791 | 3,207,681 | +0.10853% |

增加分割讓邊界近似改善，但每次球面挑選的網格點會改變，誤差不保證逐階單調。距離較遠時這些離散多極誤差更小，例如 d/R=12、m=15 時力大小偏差約 +0.0000904%。

誤差欄位定義：

    signedRelativeError = (F_numeric - F_exact) / |F_exact|
    magnitudeRelativeError = (|F_numeric| - |F_exact|) / |F_exact|
    relativeError = |F_numeric - F_exact| / |F_exact|

異號吸引時 signedRelativeError 與 magnitudeRelativeError 的符號相反；比較「作用力較大或較小」應使用 magnitudeRelativeError。零基準時三種相對誤差皆回傳 null。

## 體積數值積分

數值積分不是直接回傳精確公式：它把球 B 沿連心軸切成圓盤，對每個圓盤上不同半徑的場重新積分。令

    u = (x-x_B)/R_B ∈ [-1,1]
    t = s_perpendicular / [R_B sqrt(1-u²)] ∈ [0,1]
    dx = d + R_B u
    s_perpendicular = R_B sqrt(1-u²) t

則

    dq = (3Q_B/2)(1-u²)t dt du
    E_A,x = kQ_A dx / (dx²+s_perpendicular²)^(3/2)
    F_B,x = ∫[-1,1] ∫[0,1] E_A,x dq

繞連心軸一圈的橫向分量相消。u 與 t 使用 Gauss-Legendre 積分。為正確分出兩半球貢獻，u 在 [-1,0] 與 [0,1] 各自積分，避免用整球積分點的正負遮罩造成半球誤差。

預設 order=12，共 24 個軸向位置、各 12 個圓盤半徑，288 個場樣本。相同半徑、g/R=0.05 時，積分力與精確力的相對誤差約 2.00×10^-11；order=16 時約 6.4×10^-15。此時近半球的力貢獻約 67.0097%，遠半球約 32.9903%。這些是本實作的數值結果，不是額外物理近似。

不等半徑也能求精確總力；極端大小比與極近距離的數值積分可能需要提高 order，應查看回傳的 relativeError。接觸、重疊、非有限輸入與非正半徑均拒絕；積分階數允許 2–96。

## 驗證

執行 node --test tests/charged-spheres.test.js，23 個測試涵蓋：

- 全部不重疊距離的精確球心距力與交互作用能。
- 不同半徑、體電荷密度、內部線性場、球外點電荷場。
- 場與電位在球面的連續性、場與電位梯度關係。
- 最小 UI 間隙的 Gauss 體積積分、增加階數的收斂。
- 圓盤切片電荷積分、力積分、近半球與遠半球貢獻。
- 固定電荷能量微分、符號反轉、交換兩球、幾何縮放。
- 零電荷、有限球心場與電位、無效輸入檢查。
- 雙球離散電荷總和、所有點對的獨立三維庫倫加總。
- 有限網格偏大、偏小、非單調誤差，以及更細分割及較遠距離的改善。
- 離散點的交互作用能微分與力一致；橫向力相消，各 x 層貢獻總和一致。
- 不等半徑與各種奇數分割的水平端點、軸上距離、點電荷及吸引力方向。
- g/R=2000 時水平近／遠點對力大小比趨近 1，以及零電荷、無效分割輸入。
