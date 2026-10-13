from vpython import *
# ============================================================
#  SPIN 投球旋轉實驗室 · VPython 版   （Physics Lab）
#  在 glowscript.org 開新的 Web VPython 程式，把這整份貼上執行；
#  或在電腦上 pip install vpython 後用 Python 執行。
#  座標（捕手視角）：x 往一壘側、y 由本壘指向投手丘、z 往上
# ============================================================

# ---------- 可以改的參數（也可以用畫面下方的滑桿） ----------
hand = 'R'            # 'R' 右投、'L' 左投
speed_kmh = 152       # 出手球速 km/h
rpm = 2300            # 轉速
tilt = 1.0            # 轉軸時鐘方向（從投手背後看；12 = 純後旋往上、6 = 純上旋往下）
efficiency = 0.80     # 有效旋轉比例（其餘是陀螺旋轉）
seams = 'four'        # 'four' 四縫線、'two' 二縫線
slow = 8              # 慢動作倍率

# ---------- 物理常數 ----------
g = 9.80665           # 重力加速度
rho = 1.2             # 空氣密度 kg/m^3
Cd = 0.33             # 阻力係數
m = 0.145             # 球的質量 kg
r = 0.0366            # 球的半徑 m
A = pi * r**2
plate_y = 17 / 12 * 0.3048   # 本壘板前緣 (m)
target = vector(0, plate_y, 0.76)   # 瞄準好球帶中心


def CL(S):
    # 升力係數：Sawicki, Hubbard & Stronge (2003)
    if S <= 0:
        return 0
    return 1 / (2.32 + 0.4 / S)


def release_point():
    side = -0.55 if hand == 'R' else 0.55
    return vector(side, 16.7, 1.78)


def spin_vector(vhat):
    # 由「時鐘方向」與有效旋轉比例算出旋轉向量 ω（rad/s）
    w = rpm * 2 * pi / 60
    th = radians(tilt * 30)
    mdir = vector(-sin(th), 0, cos(th))          # 旋轉把球推去的方向（投手的右手邊 = 三壘側 = -x）
    mdir = norm(mdir - dot(mdir, vhat) * vhat)
    axisT = norm(cross(vhat, mdir))              # ω × v 要指向 mdir
    gyro_sign = 1 if hand == 'R' else -1
    return w * efficiency * axisT + w * sqrt(max(0, 1 - efficiency**2)) * gyro_sign * vhat


def accel(v, omega, magnus):
    s = mag(v)
    k = 0.5 * rho * A / m
    a = vector(0, 0, -g) - k * Cd * s * v          # 重力 + 空氣阻力
    if magnus and s > 0:
        vh = v / s
        wp = omega - dot(omega, vh) * vh             # 和前進方向垂直的那部分旋轉
        if mag(wp) > 0:
            S = r * mag(wp) / s
            a = a + k * CL(S) * s * s * norm(cross(wp, v))   # 馬格努斯力，方向 ω⊥ × v
    return a


def rk4(p, v, omega, magnus, dt):
    k1v = accel(v, omega, magnus)
    k1p = v
    k2v = accel(v + k1v * dt / 2, omega, magnus)
    k2p = v + k1v * dt / 2
    k3v = accel(v + k2v * dt / 2, omega, magnus)
    k3p = v + k2v * dt / 2
    k4v = accel(v + k3v * dt, omega, magnus)
    k4p = v + k3v * dt
    p2 = p + (k1p + 2 * k2p + 2 * k3p + k4p) * dt / 6
    v2 = v + (k1v + 2 * k2v + 2 * k3v + k4v) * dt / 6
    return p2, v2


def fly(p, v, omega, magnus, dt=0.0005):
    # 一直飛到本壘板前緣，回傳到達點、速度、時間
    t = 0
    while True:
        p2, v2 = rk4(p, v, omega, magnus, dt)
        if p2.y <= plate_y:
            f = (p.y - plate_y) / (p.y - p2.y)
            return p + (p2 - p) * f, v + (v2 - v) * f, t + dt * f
        p, v, t = p2, v2, t + dt


def aim():
    # 調整出手方向，讓「會旋轉的球」通過好球帶中心
    p0 = release_point()
    speed = speed_kmh / 3.6
    D = p0.y - plate_y
    yaw = atan2(target.x - p0.x, D)
    pitch_angle = atan2(target.z - p0.z, D)
    for i in range(40):
        v0 = speed * vector(cos(pitch_angle) * sin(yaw), -cos(pitch_angle) * cos(yaw), sin(pitch_angle))
        end, ve, te = fly(p0, v0, spin_vector(norm(v0)), True, 0.001)
        ex = target.x - end.x
        ez = target.z - end.z
        if abs(ex) < 1e-5 and abs(ez) < 1e-5:
            break
        yaw = yaw + ex / D
        pitch_angle = pitch_angle + ez / D
    return v0


def movement():
    # 旋轉造成的位移（和同樣出手、不轉的球比較），回傳 (水平, 垂直, 飛行時間, 進壘點)
    p0 = release_point()
    v0 = aim()
    omega = spin_vector(norm(v0))
    real, vr, tr = fly(p0, v0, omega, True)
    ghost, vg, tg = fly(p0, v0, omega, False)
    return (real.x - ghost.x) * 100, (real.z - ghost.z) * 100, tr, real


# ================== 以下是 3D 畫面 ==================
def to_screen(v):
    # 物理座標 (x, y 往投手丘, z 往上) → VPython 畫面座標 (x 右, y 上, z 朝向觀看者)
    return vector(v.x, v.z, -v.y)


scene = canvas(title='<b>SPIN 投球旋轉 · VPython 版</b>', width=900, height=520,
               background=vector(0.06, 0.11, 0.15), range=2.7)
scene.center = to_screen(vector(0, 3.2, 0.95))     # 從捕手後方往投手丘看
scene.forward = norm(vector(0, -0.12, -1))

# 球場
box(pos=to_screen(vector(0, 9, -0.03)), size=vector(9, 0.04, 22), color=vector(0.28, 0.45, 0.30), shininess=0)
cylinder(pos=to_screen(vector(0, 18.44, -0.02)), axis=vector(0, 0.22, 0), radius=2.7, color=vector(0.62, 0.48, 0.32), shininess=0)
box(pos=to_screen(vector(0, 18.44, 0.22)), size=vector(0.61, 0.03, 0.15), color=color.white)
box(pos=to_screen(vector(0, 0.215, 0.005)), size=vector(0.43, 0.01, 0.43), color=color.white)
zx = 0.216 + r
curve(pos=[to_screen(vector(-zx, plate_y, 0.46)), to_screen(vector(zx, plate_y, 0.46)),
           to_screen(vector(zx, plate_y, 1.07)), to_screen(vector(-zx, plate_y, 1.07)),
           to_screen(vector(-zx, plate_y, 0.46))], color=color.white, radius=0.008)

R_SHOW = 0.11      # 畫面上的球放大 3 倍，比較看得清楚
ball = sphere(radius=R_SHOW, color=color.white, make_trail=True, trail_color=vector(1, 0.5, 0.15), trail_radius=0.012)
ghost = sphere(radius=R_SHOW * 0.8, color=vector(0.6, 0.65, 0.7), opacity=0.5, make_trail=True, trail_color=vector(0.6, 0.65, 0.7), trail_radius=0.006)
axis_arrow = arrow(color=vector(1, 0.8, 0.2), shaftwidth=0.02)
force_arrow = arrow(color=vector(1, 0.45, 0.1), shaftwidth=0.03)

# 縫線（經典棒球縫線曲線）
a_s = 4 / 13
seam_body = []
for i in range(121):
    t = 2 * pi * i / 120
    seam_body.append(norm(vector((1 - a_s) * cos(t) + a_s * cos(3 * t), (1 - a_s) * sin(t) - a_s * sin(3 * t),
                                 2 * sqrt(a_s * (1 - a_s)) * sin(2 * t))))
seam = curve(color=vector(0.8, 0.08, 0.15), radius=R_SHOW * 0.05)
info = label(pos=to_screen(vector(1.4, 0.5, 1.8)), text='', height=14, box=False, color=color.white, align='left')

state = {'running': False}


def setup_pitch():
    global p, v, pg, vg, omega, omega_s, t_now, done_real, done_ghost
    p = release_point()
    v = aim()
    pg = p
    vg = v
    omega = spin_vector(norm(v))
    omega_s = to_screen(omega)
    t_now = 0
    done_real = False
    done_ghost = False
    ball.clear_trail()
    ghost.clear_trail()
    ball.pos = to_screen(p)
    ghost.pos = to_screen(p)
    # 把縫線的「四縫線/二縫線軸」轉到旋轉軸上
    body_axis = vector(0, 0, 1) if seams == 'four' else norm(vector(-1, 1, 0))
    w_hat = norm(omega_s) if mag(omega_s) > 0 else vector(0, 1, 0)
    turn_axis = cross(body_axis, w_hat)
    turn_angle = diff_angle(body_axis, w_hat)
    pts = []
    for q in seam_body:
        if mag(turn_axis) > 1e-9:
            q = rotate(q, angle=turn_angle, axis=turn_axis)
        pts.append(q * R_SHOW * 1.02)
    seam.clear()
    seam.append(pts)
    seam.origin = ball.pos
    hb, ivb, tf, end = movement()
    sign = '+' if ivb >= 0 else '−'
    info.text = '旋轉造成的位移（捕手視角）\n水平 ' + str(round(abs(hb))) + ' cm　垂直 ' + sign + str(round(abs(ivb))) + ' cm\n飛行時間 ' + str(round(tf * 1000) / 1000) + ' s'
    state['running'] = True


# ---------- 畫面下方的控制 ----------
def set_speed(s):
    global speed_kmh
    speed_kmh = s.value
    speed_text.text = ' ' + str(round(s.value)) + ' km/h'


def set_rpm(s):
    global rpm
    rpm = s.value
    rpm_text.text = ' ' + str(round(s.value)) + ' rpm'


def set_tilt(s):
    global tilt
    tilt = s.value
    hour = int(s.value)
    minute = int(round((s.value - hour) * 60))
    if hour == 0:
        hour = 12
    tilt_text.text = ' ' + str(hour) + ':' + ('0' if minute < 10 else '') + str(minute)


def set_eff(s):
    global efficiency
    efficiency = s.value
    eff_text.text = ' ' + str(round(s.value * 100)) + ' %'


PRESETS = [['四縫線速球', 152, 2300, 1.0, 0.80, 'four'], ['伸卡球', 150, 2150, 2.0, 0.70, 'two'],
           ['卡特球', 143, 2400, 11.75, 0.25, 'four'], ['滑球', 138, 2450, 9.5, 0.15, 'two'],
           ['橫掃球', 132, 2600, 9.0, 0.40, 'two'], ['曲球', 128, 2550, 7.25, 0.36, 'four'],
           ['變速球', 138, 1750, 2.25, 0.68, 'two'], ['指叉球', 139, 1350, 2.5, 0.52, 'two']]


def choose(menu_obj):
    global speed_kmh, rpm, tilt, efficiency, seams
    for row in PRESETS:
        if row[0] == menu_obj.selected:
            speed_kmh, rpm, tilt, efficiency, seams = row[1], row[2], row[3], row[4], row[5]
            if hand == 'L':
                tilt = (12 - tilt) % 12
    s_speed.value = speed_kmh
    s_rpm.value = rpm
    s_tilt.value = tilt
    s_eff.value = efficiency
    set_speed(s_speed)
    set_rpm(s_rpm)
    set_tilt(s_tilt)
    set_eff(s_eff)
    setup_pitch()


def throw(b):
    setup_pitch()


scene.append_to_caption('\n球種 ')
menu(choices=[row[0] for row in PRESETS], bind=choose)
scene.append_to_caption('　')
button(text='▶ 投球', bind=throw)
scene.append_to_caption('\n\n球速 ')
s_speed = slider(min=100, max=165, step=1, value=speed_kmh, length=220, bind=set_speed)
speed_text = wtext(text='')
scene.append_to_caption('\n轉速 ')
s_rpm = slider(min=0, max=3200, step=25, value=rpm, length=220, bind=set_rpm)
rpm_text = wtext(text='')
scene.append_to_caption('\n轉軸方向（時鐘）')
s_tilt = slider(min=0, max=11.75, step=0.25, value=tilt, length=220, bind=set_tilt)
tilt_text = wtext(text='')
scene.append_to_caption('\n有效旋轉 ')
s_eff = slider(min=0, max=1, step=0.01, value=efficiency, length=220, bind=set_eff)
eff_text = wtext(text='')
scene.append_to_caption('\n\n改完參數按「投球」。橘色是這顆球，灰色是同樣出手但完全不轉的球；黃色箭頭是轉軸，橘色箭頭是馬格努斯力。')
set_speed(s_speed)
set_rpm(s_rpm)
set_tilt(s_tilt)
set_eff(s_eff)
setup_pitch()

# ---------- 動畫 ----------
fps = 60
while True:
    rate(fps)
    if not state['running']:
        continue
    dt = 1 / fps / slow
    n = 10
    for i in range(n):
        if not done_real:
            p2, v2 = rk4(p, v, omega, True, dt / n)
            if p2.y <= plate_y:
                done_real = True
            p, v = p2, v2
        if not done_ghost:
            pg2, vg2 = rk4(pg, vg, omega, False, dt / n)
            if pg2.y <= plate_y:
                done_ghost = True
            pg, vg = pg2, vg2
    ball.pos = to_screen(p)
    ghost.pos = to_screen(pg)
    seam.origin = ball.pos
    if mag(omega_s) > 0:
        seam.rotate(angle=mag(omega) * dt, axis=omega_s, origin=ball.pos)
        axis_arrow.pos = ball.pos - norm(omega_s) * R_SHOW * 1.8
        axis_arrow.axis = norm(omega_s) * R_SHOW * 3.6
    vh = norm(v)
    wp = omega - dot(omega, vh) * vh
    if mag(wp) > 0:
        fdir = norm(to_screen(cross(wp, v)))
        force_arrow.pos = ball.pos + fdir * R_SHOW
        force_arrow.axis = fdir * R_SHOW * 2.5
    if done_real and done_ghost:
        state['running'] = False
