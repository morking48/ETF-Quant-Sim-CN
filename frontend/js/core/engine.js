/**
 * 策略调度器
 * 保留公用函数供UI层调用
 */

/** 交叉验证判断 — 检查ETF信号一致性 */
function checkCrossValidation(etfs) {
    if (!etfs || etfs.length === 0) return { verdict: '数据暂不可用', score: 0 };

    const highCount = etfs.filter(e => e.latest && e.latest.cp >= 70).length;
    const midCount = etfs.filter(e => e.latest && e.latest.cp >= 50 && e.latest.cp < 70).length;
    const total = etfs.length;

    let verdict, score;
    if (highCount >= 4) {
        verdict = `🔥 强烈看好 · ${highCount}只高确信`;
        score = 95;
    } else if (highCount >= 2) {
        verdict = `✅ 看多 · ${highCount}高 ${midCount}中`;
        score = 75;
    } else if (highCount >= 1 || midCount >= 3) {
        verdict = `📊 中性偏多 · ${highCount}高 ${midCount}中`;
        score = 55;
    } else if (midCount >= 1) {
        verdict = `⚪ 中性 · ${midCount}只中等信号`;
        score = 40;
    } else {
        verdict = '⚪ 暂无明确信号';
        score = 30;
    }

    return { verdict, score, highCount, midCount, total };
}