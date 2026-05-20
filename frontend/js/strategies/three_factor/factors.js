/**
 * 三因子计算函数（从 engine.js 抽取）
 */

function calcVolumeProb(ratio) {
    if (ratio < 0.5) return Math.max(0, ratio / 0.5 * 5);
    if (ratio < 1.0) return 5 + (ratio - 0.5) / 0.5 * 12;
    if (ratio < 1.3) return 17 + (ratio - 1) / 0.3 * 18;
    if (ratio < 1.5) return 35 + (ratio - 1.3) / 0.2 * 20;
    if (ratio < 2.0) return 55 + (ratio - 1.5) / 0.5 * 25;
    if (ratio < 3.0) return 80 + (ratio - 2) / 1 * 15;
    if (ratio < 5.0) return 95 + (ratio - 3) / 2 * 3;
    return Math.min(100, 98 + (ratio - 5) / 5 * 2);
}

function calcDirProb(etfChg, etfT5, idxT5, volRatio, idxChg) {
    let rallyDiscount = 1.0;
    if (idxChg > 2.0) rallyDiscount = 0.60;
    else if (idxChg > 1.5) rallyDiscount = 0.70;
    else if (idxChg > 1.0) rallyDiscount = 0.80;
    else if (idxChg > 0.5) rallyDiscount = 0.90;

    let f1;
    if (etfChg > 0.3 && idxT5 < -1) f1 = 95;
    else if (etfChg > 0 && idxT5 < -0.5) f1 = 85;
    else if (etfChg > 0 && idxT5 < 0) f1 = 70;
    else if (Math.abs(etfChg) < 0.15 && idxT5 < -1) f1 = 80;
    else if (Math.abs(etfChg) < 0.3 && idxT5 < -0.5) f1 = 65;
    else if (etfChg > 1 && volRatio > 1.5 && idxChg > 1) f1 = 25;
    else if (etfChg > 1 && volRatio > 1.5) f1 = 45;
    else if (etfChg > 0.5 && volRatio > 1.3 && idxChg > 1) f1 = 35;
    else if (etfChg > 0.5 && volRatio > 1.3) f1 = 50;
    else if (etfChg > 0) f1 = 40;
    else if (etfChg < -1.5 && volRatio > 2) f1 = 8;
    else if (etfChg < -0.5 && volRatio > 1.5) f1 = 15;
    else f1 = 25;

    const gap = etfT5 - idxT5;
    let f2;
    if (gap > 3) f2 = 95;
    else if (gap > 2) f2 = 85;
    else if (gap > 1.2) f2 = 75;
    else if (gap > 0.6) f2 = 60;
    else if (gap > 0.2) f2 = 50;
    else if (gap > -0.2) f2 = 40;
    else if (gap > -0.6) f2 = 30;
    else f2 = 15;

    let f3;
    if (idxT5 < -4) f3 = 95;
    else if (idxT5 < -3) f3 = 90;
    else if (idxT5 < -2) f3 = 80;
    else if (idxT5 < -1) f3 = 70;
    else if (idxT5 < -0.5) f3 = 55;
    else if (idxT5 < 0) f3 = 45;
    else if (idxT5 < 1) f3 = 35;
    else if (idxT5 < 3) f3 = 20;
    else f3 = 10;

    const f4 = 35;
    const raw = f1 * 0.4 + f2 * 0.3 + f3 * 0.2 + f4 * 0.1;
    return Math.round(raw * rallyDiscount * 10) / 10;
}

function calcShareProb(deltaPct) {
    if (deltaPct == null || deltaPct === undefined) return null;
    if (deltaPct > 10) return 95;
    else if (deltaPct > 5) return 80 + (deltaPct - 5) / 5 * 15;
    else if (deltaPct > 3) return 65 + (deltaPct - 3) / 2 * 15;
    else if (deltaPct > 1) return 45 + (deltaPct - 1) / 2 * 20;
    else if (deltaPct > 0) return 30 + deltaPct / 1 * 15;
    else if (deltaPct > -1) return 15 + (deltaPct + 1) / 1 * 15;
    else if (deltaPct > -5) return 5 + (deltaPct + 5) / 4 * 10;
    else return Math.max(0, 5 + (deltaPct + 5) / 5 * 5);
}

function calcComposite(volProb, dirProb, shareProb) {
    if (shareProb != null) {
        return Math.round((volProb * 0.5 + dirProb * 0.2 + shareProb * 0.3) * 10) / 10;
    }
    return Math.round((volProb * 0.7 + dirProb * 0.3) * 10) / 10;
}

function getSignalLevel(composite) {
    if (composite >= 70) return 'HIGH';
    if (composite >= 50) return 'MID';
    return 'NORMAL';
}