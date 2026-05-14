/**
 * 统计指标计算工具
 */

/**
 * 计算胜率
 * @param {Array} trades - 交易记录数组，每项含 pnl (盈亏金额)
 * @returns {Object} { winRate, winCount, totalCount, totalPnl }
 */
function calcWinRate(trades) {
    if (!trades || trades.length === 0) return { winRate: 0, winCount: 0, totalCount: 0, totalPnl: 0 };
    const closed = trades.filter(t => t.action === 'SELL' || t.pnl != null);
    const winCount = closed.filter(t => (t.pnl || 0) > 0).length;
    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
    return {
        winRate: closed.length > 0 ? Math.round(winCount / closed.length * 1000) / 10 : 0,
        winCount,
        totalCount: closed.length,
        totalPnl: Math.round(totalPnl * 100) / 100
    };
}

/**
 * 计算最大回撤
 * @param {Array} snapshots - 每日快照 [{total_value, date}]
 * @returns {Object} { maxDrawdown, maxDrawdownPct, peakValue, troughValue }
 */
function calcMaxDrawdown(snapshots) {
    if (!snapshots || snapshots.length < 2) return { maxDrawdown: 0, maxDrawdownPct: 0, peakValue: 0, troughValue: 0 };
    
    let peak = snapshots[0].total_value;
    let maxDD = 0;
    let maxDDPct = 0;
    let troughValue = peak;
    let peakValue = peak;
    
    for (const s of snapshots) {
        const v = s.total_value;
        if (v > peak) {
            peak = v;
            peakValue = peak;
        }
        const dd = peak - v;
        const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
        if (ddPct > maxDDPct) {
            maxDDPct = ddPct;
            maxDD = dd;
            troughValue = v;
        }
    }
    
    return {
        maxDrawdown: Math.round(maxDD * 100) / 100,
        maxDrawdownPct: Math.round(maxDDPct * 100) / 100,
        peakValue,
        troughValue
    };
}

/**
 * 简化版夏普比率
 * @param {Array} snapshots - 每日快照
 * @param {Number} riskFreeRate - 无风险利率(默认0.02即2%)
 * @returns {Number} 夏普比率
 */
function calcSharpe(snapshots, riskFreeRate = 0.02) {
    if (!snapshots || snapshots.length < 2) return 0;
    
    // 计算每日收益率
    const dailyReturns = [];
    for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1].total_value;
        const curr = snapshots[i].total_value;
        if (prev > 0) {
            dailyReturns.push((curr - prev) / prev);
        }
    }
    
    if (dailyReturns.length === 0) return 0;
    
    // 平均日收益率
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    
    // 日收益率标准差
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    // 年化夏普比率
    const dailyRiskFree = riskFreeRate / 252;
    const sharpe = (avgReturn - dailyRiskFree) / stdDev * Math.sqrt(252);
    
    return Math.round(sharpe * 100) / 100;
}

/**
 * 计算信号准确率
 * @param {Array} signals - 信号记录 [{date, code, cp, nextDayChg}]
 * @returns {Object} { accuracy, total, correct }
 */
function calcSignalAccuracy(signals) {
    if (!signals || signals.length === 0) return { accuracy: 0, total: 0, correct: 0 };
    
    const valid = signals.filter(s => s.nextDayChg != null);
    // 信号准确：高确信(>=70)且次日上涨，或低确信(<50)且次日下跌
    const correct = valid.filter(s => 
        (s.cp >= 70 && s.nextDayChg > 0) || 
        (s.cp < 50 && s.nextDayChg < 0)
    ).length;
    
    return {
        accuracy: valid.length > 0 ? Math.round(correct / valid.length * 1000) / 10 : 0,
        total: valid.length,
        correct
    };
}

/**
 * 计算累计收益率
 * @param {Number} currentValue - 当前总值
 * @param {Number} initialCapital - 初始资金
 * @returns {Number} 收益率%
 */
function calcTotalReturn(currentValue, initialCapital) {
    if (!initialCapital || initialCapital === 0) return 0;
    return Math.round((currentValue - initialCapital) / initialCapital * 10000) / 100;
}

/**
 * 计算相对基准超额收益
 * @param {Number} totalReturn - 组合累计收益率
 * @param {Number} benchmarkReturn - 基准累计收益率
 * @returns {Number} 超额收益%
 */
function calcExcessReturn(totalReturn, benchmarkReturn) {
    return Math.round((totalReturn - benchmarkReturn) * 100) / 100;
}