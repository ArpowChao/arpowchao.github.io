// Physics Lecture Interactivity and Simulations
document.addEventListener("DOMContentLoaded", () => {
    // Math Formula rendering configuration
    if (window.renderMathInElement) {
        window.renderMathInElement(document.body, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false }
            ]
        });
    }

    // --- State & Navigation ---
    const chapters = ["ch-6-1", "ch-6-2", "ch-6-3"];
    let currentChapter = "ch-6-1";
    let completedChapters = new Set();

    function updateNavigation() {
        document.querySelectorAll(".nav-item-btn").forEach(btn => {
            const chId = btn.getAttribute("data-chapter");
            btn.classList.remove("active");
            if (chId === currentChapter) {
                btn.classList.add("active");
            }
            if (completedChapters.has(chId)) {
                btn.classList.add("completed");
            } else {
                btn.classList.remove("completed");
            }
        });

        document.querySelectorAll(".concept-chapter").forEach(ch => {
            ch.classList.remove("active");
            if (ch.id === currentChapter) {
                ch.classList.add("active");
            }
        });

        // Trigger simulation resize/init for current chapter
        if (currentChapter === "ch-6-1") {
            initBlackbodySim();
        } else if (currentChapter === "ch-6-2") {
            initPhotoelectricSim();
        } else if (currentChapter === "ch-6-3") {
            initMatterWaveSim();
        }
        
        updateProgressBar();
    }

    function updateProgressBar() {
        const totalItems = chapters.length;
        const finishedItems = completedChapters.size;
        const percent = Math.round((finishedItems / totalItems) * 100);
        document.querySelector(".progress-fill").style.width = `${percent}%`;
        document.getElementById("progress-percent").textContent = `${percent}%`;
    }

    document.querySelectorAll(".nav-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            currentChapter = btn.getAttribute("data-chapter");
            updateNavigation();
        });
    });

    // --- Student Inline Answers Verification ---
    const inlineAnswers = {
        "ans-6-1": {
            type: "numeric",
            expected: 2.48,
            tolerance: 0.05,
            explanation: "光子能量公式：$E = \\frac{1240}{\\lambda} = \\frac{1240}{500} = 2.48\\text{ eV}$。",
            hint: "利用 $hc \\approx 1240\\text{ eV}\\cdot\\text{nm}$ 計算。"
        },
        "ans-6-2": {
            type: "string",
            expected: "能",
            explanation: "因為入射紫外光的能量 $3.10\\text{ eV}$ 大於鈉金屬板的激發能量門檻 $2.28\\text{ eV}$，因此光子可以將能量完全轉移給單個電子，使其成功克服阻力逸出金屬表面。",
            hint: "比較入射光子能量與金屬激發門檻能量的大小關係（填入『能』或『不能』）。"
        },
        "ans-6-3": {
            type: "string",
            expected: "短",
            explanation: "德布羅意物質波波長與物體的動量（質量與速度的乘積）成反比。當速度變快時，動量增加，因此波長會縮短（變短）。",
            hint: "物質波波長與速度成反比關係（填入『長』或『短』）。"
        }
    };

    window.verifyInlineAnswer = function(questionId) {
        const input = document.getElementById(questionId);
        const feedback = document.getElementById(`${questionId}-feedback`);
        const text = input.value.trim();
        
        const config = inlineAnswers[questionId];
        let isCorrect = false;

        if (config.type === "string") {
            isCorrect = (text === config.expected);
        } else {
            const value = parseFloat(text);
            if (isNaN(value)) {
                feedback.innerHTML = "請輸入數字！";
                feedback.className = "interactive-feedback incorrect";
                feedback.style.display = "flex";
                return;
            }
            const diff = Math.abs(value - config.expected);
            isCorrect = (diff <= config.tolerance);
        }

        if (isCorrect) {
            feedback.innerHTML = `✓ 正確！${config.explanation}`;
            feedback.className = "interactive-feedback correct";
            feedback.style.display = "flex";
            if (window.renderMathInElement) window.renderMathInElement(feedback);
            
            // Mark chapter task complete
            checkChapterCompletion(currentChapter);
        } else {
            feedback.innerHTML = `✗ 答案不夠精確，或回答錯誤，再試試看！<br>提示：${config.hint}`;
            feedback.className = "interactive-feedback incorrect";
            feedback.style.display = "flex";
        }
    };

    // --- Bloom's Taxonomy Quiz Interaction ---
    window.selectBloomOption = function(optionElement, isCorrect, explanationId, chapterId) {
        const parentList = optionElement.parentElement;
        // If already selected, do nothing
        if (parentList.querySelector(".bloom-option-item.correct") || parentList.querySelector(".bloom-option-item.incorrect")) {
            return;
        }

        // Disable all sibling options
        parentList.querySelectorAll(".bloom-option-item").forEach(item => {
            item.classList.add("disabled");
        });

        const expBox = document.getElementById(explanationId);
        expBox.style.display = "block";
        if (window.renderMathInElement) window.renderMathInElement(expBox);

        if (isCorrect) {
            optionElement.classList.add("correct");
            checkChapterCompletion(chapterId);
        } else {
            optionElement.classList.add("incorrect");
            // Highlight the correct one
            parentList.querySelectorAll(".bloom-option-item").forEach(item => {
                if (item.getAttribute("data-correct") === "true") {
                    item.classList.add("correct");
                }
            });
        }
    };

    function checkChapterCompletion(chapterId) {
        // A chapter is complete if its inline question is answered correctly AND all Bloom quiz questions are answered correctly
        const inlineCorrect = document.querySelector(`#${chapterId} .interactive-feedback.correct`) !== null;
        const quizCount = document.querySelectorAll(`#${chapterId} .bloom-option-item.correct`).length;
        
        const requiredQuizCount = 2;

        // If both criteria met, chapter is completed
        if (inlineCorrect && quizCount >= requiredQuizCount) {
            completedChapters.add(chapterId);
            updateNavigation();
        }
    }

    // --- Wavelength to RGB Converter ---
    function wavelengthToColor(wavelength) {
        let r, g, b, alpha = 1.0;
        if (wavelength >= 380 && wavelength < 440) {
            r = -(wavelength - 440) / (440 - 380);
            g = 0.0;
            b = 1.0;
        } else if (wavelength >= 440 && wavelength < 490) {
            r = 0.0;
            g = (wavelength - 440) / (490 - 440);
            b = 1.0;
        } else if (wavelength >= 490 && wavelength < 510) {
            r = 0.0;
            g = 1.0;
            b = -(wavelength - 510) / (510 - 490);
        } else if (wavelength >= 510 && wavelength < 580) {
            r = (wavelength - 510) / (580 - 510);
            g = 1.0;
            b = 0.0;
        } else if (wavelength >= 580 && wavelength < 645) {
            r = 1.0;
            g = -(wavelength - 645) / (645 - 580);
            b = 0.0;
        } else if (wavelength >= 645 && wavelength <= 780) {
            r = 1.0;
            g = 0.0;
            b = 0.0;
        } else if (wavelength < 380) { // UV
            r = 0.5; g = 0.0; b = 0.7; // Violet-ish
            alpha = 0.5;
        } else { // IR
            r = 0.8; g = 0.0; b = 0.0; // Deep red
            alpha = 0.3;
        }

        // Intensity factor for fading near visibility limits
        let factor = 1.0;
        if (wavelength >= 380 && wavelength < 420) factor = 0.3 + 0.7*(wavelength - 380) / (420 - 380);
        else if (wavelength >= 420 && wavelength < 701) factor = 1.0;
        else if (wavelength >= 701 && wavelength <= 780) factor = 0.3 + 0.7*(780 - wavelength) / (780 - 701);
        else factor = 0.2;

        return `rgba(${Math.round(r * 255 * factor)}, ${Math.round(g * 255 * factor)}, ${Math.round(b * 255 * factor)}, ${alpha})`;
    }

    // ==========================================
    // SIMULATION 6-1: Blackbody Radiation Curve
    // ==========================================
    let blackbodyInterval = null;
    function initBlackbodySim() {
        const canvas = document.getElementById("bb-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const tempSlider = document.getElementById("bb-temp");
        const tempDisplay = document.getElementById("bb-temp-val");

        // Constants
        const h = 6.626e-34;
        const c = 3.0e8;
        const k = 1.38e-23;

        function drawBlackbody() {
            const width = canvas.width = canvas.parentElement.clientWidth;
            const height = canvas.height = 300;
            ctx.clearRect(0, 0, width, height);

            const temp = parseFloat(tempSlider.value);
            tempDisplay.textContent = `${temp} K`;

            // Draw axis
            ctx.strokeStyle = "#475569";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(50, 20);
            ctx.lineTo(50, height - 40);
            ctx.lineTo(width - 20, height - 40);
            ctx.stroke();

            // Axis labels
            ctx.fillStyle = "#94a3b8";
            ctx.font = "10px monospace";
            ctx.fillText("輻射強度 I(λ)", 10, 15);
            ctx.fillText("波長 λ (nm)", width - 80, height - 15);

            // Draw visible spectrum background band
            // Visible wavelength: 380nm (violet) to 750nm (red)
            const xStart = wavelengthToX(380, width);
            const xEnd = wavelengthToX(750, width);
            let gradient = ctx.createLinearGradient(xStart, 0, xEnd, 0);
            for (let wl = 380; wl <= 750; wl += 10) {
                gradient.addColorStop((wl - 380) / (750 - 380), wavelengthToColor(wl));
            }
            ctx.fillStyle = gradient;
            ctx.globalAlpha = 0.08;
            ctx.fillRect(xStart, 20, xEnd - xStart, height - 60);
            ctx.globalAlpha = 1.0;

            // Draw Wien's peak indicator
            // Peak wavelength λ_max = 2.898 * 10^6 / T (nm)
            const lambdaMax = 2.89777e6 / temp;
            const xPeak = wavelengthToX(lambdaMax, width);
            
            // Draw Plank's Curve
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 2.5;
            ctx.beginPath();

            let maxVal = getPlanckVal(2.89777e6 / 6000, 6000); // Scale factor based on max temperature
            let first = true;
            for (let x = 50; x < width - 20; x++) {
                const lambda = xToWavelength(x, width); // Wavelength in nm
                const val = getPlanckVal(lambda, temp);
                const y = height - 40 - (val / maxVal) * (height - 80) * 1.5; // Scale curve height

                if (y >= 20 && y <= height - 40) {
                    if (first) {
                        ctx.moveTo(x, y);
                        first = false;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            ctx.stroke();

            // Draw peak vertical line
            if (xPeak > 50 && xPeak < width - 20) {
                ctx.strokeStyle = "#f87171";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(xPeak, 20);
                ctx.lineTo(xPeak, height - 40);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = "#f87171";
                ctx.fillText(`λ_max = ${Math.round(lambdaMax)} nm`, xPeak - 40, 35);
            }

            // Stats update
            document.getElementById("stat-peak-wl").textContent = `${Math.round(lambdaMax)} nm`;
            // Total energy E ∝ T^4 (Stefan-Boltzmann)
            const totalEnergyRel = Math.pow(temp / 3000, 4).toFixed(1);
            document.getElementById("stat-total-energy").textContent = `${totalEnergyRel}x`;
        }

        function wavelengthToX(wl, width) {
            // Map 100nm to 2000nm onto canvas
            const minWl = 100;
            const maxWl = 2000;
            return 50 + ((wl - minWl) / (maxWl - minWl)) * (width - 70);
        }

        function xToWavelength(x, width) {
            const minWl = 100;
            const maxWl = 2000;
            return minWl + ((x - 50) / (width - 70)) * (maxWl - minWl);
        }

        function getPlanckVal(lambdaNm, T) {
            const l = lambdaNm * 1e-9; // convert to meters
            const C1 = 3.74177e-16; // 2 * pi * h * c^2
            const C2 = 0.0143878; // h * c / k
            return C1 / (Math.pow(l, 5) * (Math.exp(C2 / (l * T)) - 1));
        }

        tempSlider.oninput = drawBlackbody;
        drawBlackbody();
    }

    // ==========================================
    // SIMULATION 6-2: Photoelectric Effect
    // ==========================================
    let photoelectricAnimFrame = null;
    function initPhotoelectricSim() {
        const canvas = document.getElementById("pe-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const wlSlider = document.getElementById("pe-wl");
        const wlDisplay = document.getElementById("pe-wl-val");
        const intSlider = document.getElementById("pe-int");
        const intDisplay = document.getElementById("pe-int-val");
        const metalSelect = document.getElementById("pe-metal");

        const metals = {
            sodium: { workFunction: 2.28, name: "鈉 (Na)" },
            zinc: { workFunction: 4.30, name: "鋅 (Zn)" },
            copper: { workFunction: 4.70, name: "銅 (Cu)" }
        };

        let photons = [];
        let electrons = [];
        let animationTime = 0;

        function animate() {
            const width = canvas.width = canvas.parentElement.clientWidth;
            const height = canvas.height = 320;
            ctx.clearRect(0, 0, width, height);

            const wavelength = parseFloat(wlSlider.value);
            const intensity = parseFloat(intSlider.value);
            const selectedMetal = metals[metalSelect.value];
            
            wlDisplay.textContent = `${wavelength} nm`;
            intDisplay.textContent = `${intensity} %`;

            const h_eV_s = 4.1357e-15;
            const c_m_s = 3e8;
            const photonEnergy = 1240 / wavelength; // eV
            const maxKE = photonEnergy - selectedMetal.workFunction; // eV
            const isEmitted = maxKE > 0;

            // Draw vacuum tube outline
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 2;
            ctx.strokeRect(50, 40, width - 100, height - 80);

            // Draw Cathode (Metal Plate)
            ctx.fillStyle = "#475569";
            ctx.fillRect(80, 60, 20, height - 120);
            ctx.fillStyle = "#94a3b8";
            ctx.font = "12px sans-serif";
            ctx.fillText(selectedMetal.name, 72, 50);

            // Draw Anode (Collector Plate)
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(width - 100, 60, 15, height - 120);
            ctx.strokeStyle = "#38bdf8";
            ctx.strokeRect(width - 100, 60, 15, height - 120);

            // Generate Photons based on intensity
            if (intensity > 0 && Math.random() < (intensity / 100) * 0.4) {
                photons.push({
                    x: 20,
                    y: 40 + Math.random() * (height - 120),
                    wavelength: wavelength,
                    color: wavelengthToColor(wavelength),
                    speed: 5
                });
            }

            // Update & Draw Photons
            ctx.lineWidth = 2;
            photons.forEach((p, index) => {
                p.x += p.speed;
                p.y += p.speed * 0.4; // diagonal path

                // Draw photon wave packet
                ctx.strokeStyle = p.color;
                ctx.beginPath();
                for (let i = -15; i <= 15; i++) {
                    const waveX = p.x + i;
                    const waveY = p.y + Math.sin((p.x + i) * (2 * Math.PI / (p.wavelength / 15))) * 8;
                    if (i === -15) ctx.moveTo(waveX, waveY);
                    else ctx.lineTo(waveX, waveY);
                }
                ctx.stroke();

                // Collision with Metal Plate (at x = 80)
                if (p.x >= 80) {
                    photons.splice(index, 1);
                    if (isEmitted) {
                        // Emit Electron
                        electrons.push({
                            x: 85,
                            y: p.y,
                            speed: 1.5 + Math.sqrt(maxKE) * 3, // speed depends on KE
                            color: "#10b981",
                            radius: 4
                        });
                    }
                }
            });

            // Update & Draw Electrons
            electrons.forEach((e, index) => {
                e.x += e.speed;

                // Draw glowing electron
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 10;
                ctx.fillStyle = e.color;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0; // reset

                // Hit collector plate
                if (e.x >= width - 100) {
                    electrons.splice(index, 1);
                }
            });

            // Calculate output indicators
            document.getElementById("stat-photon-energy").textContent = `${photonEnergy.toFixed(2)} eV`;
            
            let thresholdText = "中";
            if (metalSelect.value === "sodium") thresholdText = "低";
            if (metalSelect.value === "copper") thresholdText = "高";
            document.getElementById("stat-metal-threshold").textContent = thresholdText;
            
            document.getElementById("stat-is-emitted").textContent = isEmitted ? "是" : "否";
            document.getElementById("stat-is-emitted").style.color = isEmitted ? "#10b981" : "#ef4444";
            
            let currentText = "無";
            if (isEmitted) {
                if (intensity === 0) currentText = "無";
                else if (intensity < 30) currentText = "微弱";
                else if (intensity < 70) currentText = "中等";
                else currentText = "顯著";
            }
            document.getElementById("stat-photocurrent").textContent = currentText;
            document.getElementById("stat-photocurrent").style.color = isEmitted && intensity > 0 ? "#10b981" : "#94a3b8";

            animationTime++;
            photoelectricAnimFrame = requestAnimationFrame(animate);
        }

        // Clean up previous loop if any
        if (photoelectricAnimFrame) cancelAnimationFrame(photoelectricAnimFrame);
        animate();
    }

    // ==========================================
    // SIMULATION 6-3: De Broglie Matter Wave
    // ==========================================
    let matterWaveAnimFrame = null;
    function initMatterWaveSim() {
        const canvas = document.getElementById("mw-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const particleSelect = document.getElementById("mw-particle");
        const velSlider = document.getElementById("mw-vel");
        const velDisplay = document.getElementById("mw-vel-val");
        const slitsToggle = document.getElementById("mw-slits");

        const particles = {
            electron: { mass: 9.1e-31, name: "電子", relativeMass: 1, color: "#10b981" },
            alpha: { mass: 6.64e-27, name: "α 粒子", relativeMass: 7300, color: "#8b5cf6" },
            baseball: { mass: 0.145, name: "棒球", relativeMass: 1e30, color: "#fbbf24" }
        };

        let particleX = 50;
        let t = 0;
        let hitPattern = []; // Stores electron hit spots for double slit

        function animate() {
            const width = canvas.width = canvas.parentElement.clientWidth;
            const height = canvas.height = 320;
            ctx.clearRect(0, 0, width, height);

            const type = particleSelect.value;
            const speed = parseFloat(velSlider.value);
            const showSlits = slitsToggle.checked;
            const selectedPart = particles[type];

            velDisplay.textContent = `${speed} x10^6 m/s`;

            // Calculate de Broglie wavelength (schematic)
            // lambda = h / (m * v). If baseball, it is tiny. If electron, visible.
            const h_scaled = 400; // Scaled Planck's constant for display
            const wavelength = h_scaled / (selectedPart.relativeMass * speed);

            // Draw screens & slits if enabled
            if (showSlits) {
                // Draw Slit Wall at x = width / 2
                ctx.fillStyle = "#334155";
                const wallX = width / 2;
                
                // Slits definition
                const slitWidth = 10;
                const slitGap = 40;
                const topSlitY = height / 2 - slitGap/2 - slitWidth/2;
                const bottomSlitY = height / 2 + slitGap/2 - slitWidth/2;

                ctx.fillRect(wallX, 20, 10, topSlitY - 20);
                ctx.fillRect(wallX, topSlitY + slitWidth, 10, slitGap - slitWidth);
                ctx.fillRect(wallX, bottomSlitY + slitWidth, 10, height - 20 - (bottomSlitY + slitWidth));

                // Draw Detector screen at the right end
                ctx.fillStyle = "#1e293b";
                ctx.fillRect(width - 80, 20, 10, height - 40);

                // Draw particle hits histogram
                ctx.fillStyle = "rgba(16, 185, 129, 0.4)";
                hitPattern.forEach(hitY => {
                    ctx.beginPath();
                    ctx.arc(width - 75, hitY, 3, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            // Update Particle X
            particleX += speed * 2;
            if (particleX > width - 100 && showSlits) {
                // Register hit on screen
                // Probability distribution based on double-slit interference
                let hitY;
                if (type === "baseball") {
                    // Classic: hits right behind slits
                    hitY = Math.random() < 0.5 ? 
                        (height/2 - 20) + (Math.random() - 0.5) * 15 : 
                        (height/2 + 20) + (Math.random() - 0.5) * 15;
                } else {
                    // Interference: diffraction pattern
                    // I = I0 * cos^2(pi*d*sin(theta)/lambda) * sinc^2(pi*a*sin(theta)/lambda)
                    // Let's sample using rejection sampling or simple approximation
                    const wl_calc = Math.max(8, wavelength);
                    let found = false;
                    while (!found) {
                        const y = 30 + Math.random() * (height - 60);
                        const theta = (y - height/2) / 100;
                        const intensity = Math.pow(Math.cos(Math.PI * 40 * theta / wl_calc), 2);
                        if (Math.random() < intensity) {
                            hitY = y;
                            found = true;
                        }
                    }
                }
                hitPattern.push(hitY);
                if (hitPattern.length > 150) hitPattern.shift(); // Keep limit
                particleX = 50;
            } else if (particleX > width - 40) {
                particleX = 50;
            }

            // Draw Wave Packet
            const centerY = height / 2;
            ctx.shadowBlur = 0;

            if (type !== "baseball") {
                // Draw wave function ψ(x) envelope and oscillations
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = selectedPart.color;
                ctx.beginPath();
                for (let x = 50; x < width - 50; x++) {
                    const distanceToPart = Math.abs(x - particleX);
                    // Gaussian envelope centered at particle
                    const envelope = Math.exp(-Math.pow(distanceToPart / 40, 2)); 
                    const osc = Math.sin((x - particleX) * (2 * Math.PI / Math.max(4, wavelength)));
                    const y = centerY + envelope * osc * 40;

                    if (x === 50) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // Draw Particle Dot
            ctx.fillStyle = selectedPart.color;
            ctx.shadowColor = selectedPart.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(particleX, centerY, type === "baseball" ? 8 : 5, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Output qualitative values
            let massText = "極小";
            if (type === "alpha") massText = "中等";
            if (type === "baseball") massText = "極大";
            document.getElementById("stat-mw-mass").textContent = massText;

            let velText = "慢";
            if (speed < 2.0) velText = "慢";
            else if (speed < 4.0) velText = "中等";
            else velText = "快";
            document.getElementById("stat-mw-velocity").textContent = velText;

            let visibilityText = "無";
            let visibilityColor = "#94a3b8";
            if (type === "electron") {
                visibilityText = "極顯著";
                visibilityColor = "#10b981";
            } else if (type === "alpha") {
                visibilityText = "微弱";
                visibilityColor = "#8b5cf6";
            } else {
                visibilityText = "無 (顯現完全粒子性)";
                visibilityColor = "#ef4444";
            }
            const visibilityEl = document.getElementById("stat-mw-wave-visibility");
            visibilityEl.textContent = visibilityText;
            visibilityEl.style.color = visibilityColor;

            t++;
            matterWaveAnimFrame = requestAnimationFrame(animate);
        }

        // Clean up previous loop if any
        if (matterWaveAnimFrame) cancelAnimationFrame(matterWaveAnimFrame);
        animate();
    }

    // Kickstart first chapter
    updateNavigation();
});
