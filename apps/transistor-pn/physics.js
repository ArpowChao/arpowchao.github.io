/**
 * First-principles semiconductor physics engine for:
 *   1. PN Junction (Poisson depletion, built-in barrier, diffusion vs. drift, Shockley I-V)
 *   2. NPN BJT (Emitter-Base barrier lowering, minority-carrier diffusion-recombination in Base,
 *      B-C electric-field sweep, Ebers-Moll currents with Early effect)
 *   3. N-MOSFET (Gate electric-field depletion, inversion channel formation, pinch-off saturation)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.TransistorPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VT = 0.02585;
  const EG_SI = 1.12;
  const NC = 2.8e19;
  const NV = 2.33e19;
  const NI = Math.sqrt(NC * NV) * Math.exp(-EG_SI / (2 * VT));
  const EPS_SI = 1.0359e-12;
  const Q_E = 1.602176634e-19;

  const CM_TO_UM = 1e4;
  const UM_TO_CM = 1e-4;

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function solvePNJunction(params) {
    const p = params || {};
    const na = clamp(Number(p.na) || 2e16, 1e15, 1e18);
    const nd = clamp(Number(p.nd) || 2e16, 1e15, 1e18);
    const vd = clamp(p.vd !== undefined ? Number(p.vd) : 0, -5.0, 0.80);

    const vbi = VT * Math.log((na * nd) / (NI * NI));
    const veff = Math.max(0.04, vbi - vd);

    const wCm = Math.sqrt((2 * EPS_SI / Q_E) * ((na + nd) / (na * nd)) * veff);
    const wUm = wCm * CM_TO_UM;
    const xpUm = wUm * (nd / (na + nd));
    const xnUm = wUm * (na / (na + nd));

    const eMaxVCm = -(2 * veff) / Math.max(wCm, 1e-9);
    const eMaxKvCm = eMaxVCm / 1000;

    const area = 1e-2;
    const dn = 25;
    const dp = 10;
    const ln = 30e-4;
    const lp = 15e-4;
    const isAmp = Q_E * area * NI * NI * (dn / (ln * na) + dp / (lp * nd));
    const nIdeality = 1.18;
    const rsOhm = 8.0;

    function solveDiodePoint(vApp) {
      let vjPoint = vApp;
      if (vApp > 0.05) {
        let lo = 0;
        let hi = vApp;
        for (let iter = 0; iter < 42; iter++) {
          const mid = 0.5 * (lo + hi);
          const iMid = isAmp * Math.expm1(mid / (nIdeality * VT));
          if (mid + iMid * rsOhm > vApp) hi = mid;
          else lo = mid;
        }
        vjPoint = 0.5 * (lo + hi);
      }
      const iDiff = isAmp * Math.exp(vjPoint / (nIdeality * VT));
      const gF = vApp < 0 ? 1 + 0.35 * Math.sqrt(Math.abs(vApp)) : 1;
      const iDrift = isAmp * gF;
      const iNet = vApp >= 0 ? (iDiff - isAmp) : (iDiff - iDrift);
      return { iDiff, iDrift, iNet };
    }

    const pt = solveDiodePoint(vd);
    const iDiffAmp = pt.iDiff;
    const iDriftAmp = pt.iDrift;
    const iNetAmp = pt.iNet;

    const nPts = 161;
    const xMin = -2.0;
    const xMax = 2.0;
    const profile = [];
    const evP = -VT * Math.log(NV / na);
    const ecP = evP + EG_SI;
    const eFp = 0;
    const eFn = vd;

    for (let i = 0; i < nPts; i++) {
      const x = xMin + ((xMax - xMin) * i) / (nPts - 1);
      let rho = 0;
      let eField = 0;
      let phi = 0;

      if (x <= -xpUm) {
        rho = 0;
        eField = 0;
        phi = 0;
      } else if (x < 0) {
        rho = -na;
        const frac = (x + xpUm) / Math.max(xpUm, 1e-6);
        eField = eMaxKvCm * frac;
        const dxCm = (x + xpUm) * UM_TO_CM;
        phi = (Q_E * na * dxCm * dxCm) / (2 * EPS_SI);
      } else if (x <= xnUm) {
        rho = nd;
        const frac = (xnUm - x) / Math.max(xnUm, 1e-6);
        eField = eMaxKvCm * frac;
        const dxN = (xnUm - x) * UM_TO_CM;
        phi = veff - (Q_E * nd * dxN * dxN) / (2 * EPS_SI);
      } else {
        rho = 0;
        eField = 0;
        phi = veff;
      }

      const ec = ecP - phi;
      const ev = ec - EG_SI;
      profile.push({ x, rho, eField, phi, ec, ev, eFp, eFn });
    }

    const ivCurve = [];
    const vSteps = 90;
    for (let i = 0; i <= vSteps; i++) {
      const v = -2.0 + (2.8 * i) / vSteps;
      ivCurve.push({ v, iMa: solveDiodePoint(v).iNet * 1000 });
    }

    let regime = 'equilibrium';
    if (vd > 0.08) regime = 'forward';
    else if (vd < -0.08) regime = 'reverse';

    return {
      mode: 'pn',
      na,
      nd,
      vd,
      vbi,
      veff,
      wUm,
      xpUm,
      xnUm,
      eMaxVCm,
      eMaxKvCm,
      isAmp,
      iDiffMa: iDiffAmp * 1000,
      iDriftMa: iDriftAmp * 1000,
      iNetMa: iNetAmp * 1000,
      regime,
      profile,
      ivCurve
    };
  }

  function solveNPNBJT(params) {
    const p = params || {};
    const vbe = clamp(p.vbe !== undefined ? Number(p.vbe) : 0.72, 0.0, 0.85);
    const vce = clamp(p.vce !== undefined ? Number(p.vce) : 5.0, 0.0, 10.0);
    const wbUm = clamp(p.wbUm !== undefined ? Number(p.wbUm) : 0.8, 0.3, 5.0);
    const nab = clamp(Number(p.nab) || 2e16, 5e15, 5e17);

    const nde = 5e18;
    const ndc = 3e15;
    const vbc = vbe - vce;
    const vaEarly = 60.0;

    const vbiEB = VT * Math.log((nde * nab) / (NI * NI));
    const vBarEB = Math.max(0.04, vbiEB - vbe);
    const wEBCm = Math.sqrt((2 * EPS_SI / Q_E) * ((nde + nab) / (nde * nab)) * vBarEB);
    const wEBUm = wEBCm * CM_TO_UM;
    const xnEBUm = wEBUm * (nab / (nde + nab));
    const xpEBUm = wEBUm * (nde / (nde + nab));

    const vbiBC = VT * Math.log((nab * ndc) / (NI * NI));
    const vBarBC = Math.max(0.04, vbiBC - vbc);
    const wBCCm = Math.sqrt((2 * EPS_SI / Q_E) * ((nab + ndc) / (nab * ndc)) * vBarBC);
    const wBCUm = wBCCm * CM_TO_UM;
    const xpBCUm = wBCUm * (ndc / (nab + ndc));
    const xnBCUm = wBCUm * (nab / (nab + ndc));
    const eMaxBCKvCm = ((2 * vBarBC) / Math.max(wBCCm, 1e-9)) / 1000;

    const wEffUm = Math.max(0.08, wbUm - 0.55 * xpEBUm - 0.55 * xpBCUm);
    const wEffCm = wEffUm * UM_TO_CM;

    const muN = 100 + 1250 / (1 + Math.pow(nab / 1e17, 0.7));
    const dn = VT * muN;
    const dp = 10.0;
    const lpUm = 1.0;
    const tauN = 3.2e-8 / (1 + nab / 2e16);
    const lnCm = Math.sqrt(dn * tauN);
    const lnUm = lnCm * CM_TO_UM;

    const ratioWL = wEffUm / Math.max(lnUm, 1e-4);
    const alphaT = 1 / Math.cosh(ratioWL);
    const gamma = 1 / (1 + (dp * nab * wEffUm) / (dn * nde * lpUm));
    const alphaF = clamp(gamma * alphaT, 0.05, 0.9995);
    const betaF = alphaF / (1 - alphaF);
    const alphaR = 0.55;

    const areaEff = 1.6e-3;
    const isAmp = (Q_E * areaEff * dn * NI * NI) / (nab * wEffCm);
    const reOhm = 1.5;
    const rcOhm = 4.5;

    function solveOperatingPoint(vbeVal, vceVal) {
      const ef = 1 + Math.max(0, vceVal) / vaEarly;

      function solveInternalGivenVbe(vbeTrial) {
        const iCF = isAmp * Math.expm1(vbeTrial / VT) * ef;
        let loC = -0.35;
        let hiC = vceVal;
        for (let k = 0; k < 32; k++) {
          const midC = 0.5 * (loC + hiC);
          const vbcMid = Math.min(0.85, vbeTrial - midC);
          const iCR = isAmp * Math.expm1(vbcMid / VT);
          const icMid = iCF - iCR / alphaR;
          if (midC + icMid * rcOhm > vceVal) hiC = midC;
          else loC = midC;
        }
        const vceInt = 0.5 * (loC + hiC);
        const vbcInt = Math.min(0.85, vbeTrial - vceInt);
        const iCR = isAmp * Math.expm1(vbcInt / VT);
        const iEAmp = iCF / alphaF - iCR;
        const iCAmp = iCF - iCR / alphaR;
        return { vceInt, vbcInt, iCF, iCR, iEAmp, iCAmp };
      }

      let vbeTrial = vbeVal;
      if (vbeVal > 0.30) {
        let lo = 0;
        let hi = vbeVal;
        for (let iter = 0; iter < 34; iter++) {
          const mid = 0.5 * (lo + hi);
          const st = solveInternalGivenVbe(mid);
          if (mid + st.iEAmp * reOhm > vbeVal) hi = mid;
          else lo = mid;
        }
        vbeTrial = 0.5 * (lo + hi);
      }

      const st = solveInternalGivenVbe(vbeTrial);
      return {
        vbeInt: vbeTrial,
        vceInt: st.vceInt,
        vbcInt: st.vbcInt,
        iEAmp: st.iEAmp,
        iCAmp: st.iCAmp,
        iBAmp: st.iEAmp - st.iCAmp
      };
    }

    const op = solveOperatingPoint(vbe, vce);
    const vbeInt = op.vbeInt;
    const vbcInt = op.vbcInt;
    const iEAmp = op.iEAmp;
    const iCAmp = op.iCAmp;
    const iBAmp = op.iBAmp;

    const icMa = iCAmp * 1000;
    const ibMa = iBAmp * 1000;
    const ieMa = iEAmp * 1000;

    let regime = 'active';
    if (vbe < 0.50) {
      regime = 'cutoff';
    } else if (vbcInt > 0.40 || vce < Math.max(0.25, vbe - 0.42)) {
      regime = 'saturation';
    }

    const eStart = -2.2;
    const cEnd = wbUm + 3.0;
    const nBandPts = 180;
    const bandProfile = [];
    const ecE = 0;
    const ecB = ecE + vBarEB;
    const ecC = ecB - vBarBC;
    const jEB = 0;
    const jBC = wbUm;

    for (let i = 0; i < nBandPts; i++) {
      const x = eStart + ((cEnd - eStart) * i) / (nBandPts - 1);
      let ec = ecE;
      if (x <= jEB - xnEBUm) {
        ec = ecE;
      } else if (x < jEB + xpEBUm) {
        const u = (x - (jEB - xnEBUm)) / Math.max(xnEBUm + xpEBUm, 1e-4);
        const s = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        ec = ecE + (ecB - ecE) * s;
      } else if (x <= jBC - xpBCUm) {
        ec = ecB;
      } else if (x < jBC + xnBCUm) {
        const u = (x - (jBC - xpBCUm)) / Math.max(xpBCUm + xnBCUm, 1e-4);
        const s = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        ec = ecB + (ecC - ecB) * s;
      } else {
        ec = ecC;
      }
      bandProfile.push({ x, ec, ev: ec - EG_SI });
    }

    const np0 = (NI * NI) / nab;
    const dnp0 = np0 * Math.expm1(vbeInt / VT);
    const dnpW = np0 * Math.expm1(vbcInt / VT);
    const sinhWL = Math.sinh(ratioWL);
    const baseCarrierProfile = [];
    const nBasePts = 51;
    for (let i = 0; i < nBasePts; i++) {
      const u = i / (nBasePts - 1);
      const xB = u * wEffUm;
      const dnp = sinhWL > 1e-6
        ? (dnp0 * Math.sinh((wEffUm - xB) / lnUm) + dnpW * Math.sinh(xB / lnUm)) / sinhWL
        : dnp0 * (1 - u) + dnpW * u;
      baseCarrierProfile.push({
        u,
        xUm: xB,
        np: Math.max(0, np0 + dnp),
        npLinear: Math.max(0, np0 + dnp0 * (1 - u) + dnpW * u)
      });
    }

    const vbeFamily = [0.64, 0.68, 0.72, 0.76, 0.80];
    const outputCurves = vbeFamily.map((vbeCurve) => {
      const pts = [];
      for (let k = 0; k <= 60; k++) {
        const vx = (10.0 * k) / 60;
        const point = solveOperatingPoint(vbeCurve, vx);
        pts.push({ vce: vx, icMa: Math.max(0, point.iCAmp * 1000) });
      }
      return { vbe: vbeCurve, pts };
    });

    return {
      mode: 'bjt',
      vbe,
      vbeInt,
      vce,
      vbc,
      wbUm,
      wEffUm,
      nab,
      nde,
      ndc,
      vbiEB,
      vBarEB,
      vbiBC,
      vBarBC,
      wEBUm,
      xnEBUm,
      xpEBUm,
      wBCUm,
      xpBCUm,
      xnBCUm,
      eMaxBCKvCm,
      lnUm,
      alphaT,
      gamma,
      alphaF,
      betaF,
      recombFraction: 1 - alphaF,
      icMa,
      ibMa,
      ieMa,
      regime,
      bandProfile,
      baseCarrierProfile,
      outputCurves
    };
  }

  function solveNMOSFET(params) {
    const p = params || {};
    const vgs = clamp(p.vgs !== undefined ? Number(p.vgs) : 3.0, 0.0, 5.0);
    const vds = clamp(p.vds !== undefined ? Number(p.vds) : 2.5, 0.0, 5.0);
    const vth = clamp(p.vth !== undefined ? Number(p.vth) : 1.0, 0.5, 2.0);

    const vov = vgs - vth;
    const kn = 4.0;
    const lambda = 0.04;

    let regime = 'cutoff';
    let idMa = 0;
    let pinchRatio = 1.0;

    if (vgs < vth) {
      regime = 'cutoff';
      idMa = 0;
      pinchRatio = 0;
    } else if (vds < vov) {
      regime = 'triode';
      idMa = kn * (vov * vds - 0.5 * vds * vds) * (1 + lambda * vds);
      pinchRatio = 1.0;
    } else {
      regime = 'saturation';
      idMa = 0.5 * kn * vov * vov * (1 + lambda * vds);
      pinchRatio = clamp(vov / Math.max(vds, 0.01), 0.25, 1.0);
    }

    const nPts = 61;
    const channelProfile = [];
    for (let i = 0; i < nPts; i++) {
      const u = i / (nPts - 1);
      const vEffChannel = vgs >= vth ? Math.min(vds, vov) : 0;
      const vLocal = u <= pinchRatio ? vEffChannel * Math.sqrt(u / Math.max(pinchRatio, 0.01)) : vov + (vds - vov) * ((u - pinchRatio) / Math.max(1 - pinchRatio, 0.01));
      const invNorm = vgs >= vth ? clamp((vgs - vLocal - vth) / 4.0, 0, 1) : 0;
      const depDepthNorm = clamp(0.18 + 0.12 * vgs + 0.14 * vLocal, 0.15, 0.92);
      channelProfile.push({ u, vLocal, invNorm, depDepthNorm });
    }

    const vgsFamily = [1.5, 2.0, 3.0, 4.0, 5.0];
    const outputCurves = vgsFamily.map((vg) => {
      const pts = [];
      const ov = vg - vth;
      for (let k = 0; k <= 50; k++) {
        const vd = (5.0 * k) / 50;
        let id = 0;
        if (ov > 0) {
          if (vd < ov) {
            id = kn * (ov * vd - 0.5 * vd * vd) * (1 + lambda * vd);
          } else {
            id = 0.5 * kn * ov * ov * (1 + lambda * vd);
          }
        }
        pts.push({ vds: vd, idMa: id });
      }
      return { vgs: vg, pts };
    });

    const bandProfile = [];
    const barrierPeak = vgs >= vth
      ? Math.max(0.06, 0.55 - 0.38 * clamp((vgs - vth) / 2.5, 0, 1.1))
      : 0.75 - 0.12 * clamp(vgs / Math.max(vth, 0.1), 0, 1);

    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      let ec = 0;
      if (u < 0.15) {
        ec = 0;
      } else if (u < 0.25) {
        const t = (u - 0.15) / 0.1;
        ec = barrierPeak * (3 * t * t - 2 * t * t * t);
      } else if (u < 0.80) {
        const t = (u - 0.25) / 0.55;
        ec = barrierPeak - 0.22 * vds * t;
      } else if (u < 0.90) {
        const t = (u - 0.80) / 0.10;
        const start = barrierPeak - 0.22 * vds;
        const end = -0.25 * vds;
        ec = start + (end - start) * (3 * t * t - 2 * t * t * t);
      } else {
        ec = -0.25 * vds;
      }
      bandProfile.push({ x: u, ec, ev: ec - EG_SI });
    }

    return {
      mode: 'mosfet',
      vgs,
      vds,
      vth,
      vov,
      idMa,
      igMa: 0,
      regime,
      pinchRatio,
      channelProfile,
      outputCurves,
      bandProfile
    };
  }

  return {
    constants: { VT, EG_SI, NC, NV, NI, EPS_SI, Q_E },
    solvePNJunction,
    solveNPNBJT,
    solveNMOSFET
  };
});
