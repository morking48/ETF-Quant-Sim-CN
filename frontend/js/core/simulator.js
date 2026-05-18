/**
 * 模拟交易引擎
 * 基于三因子信号进行纸上交易模拟
 */

// ========== 默认配置 ==========
const DEFAULT_SIM_CONFIG = {
    initialCapital: 100000,      // 初始资金 10万
    positionRatio: 0.30,         // 首次建仓比例 30%
    addRatio: 0.20,              // 加仓比例 20%
    maxSinglePct: 0.50,          // 单只ETF上限 50%
    maxTotalPct: 0.80,           // 总仓位上限 80%
    stopLossPct: -0.05,          // 硬止损线 -5%
    timeStopDays: 10,            // 时间止损天数
    signalSellPct: 0.40,         // 信号卖出阈值(综合概率<40%)
    tradeMode: 'manual',         // manual | semi | auto
    feeRate: 0.00025,            // 手续费率 万2.5
    strategy: 'signal_band',     // signal_band | ma_filter | position_rotate | grid_invest
};

// ========== 存储Key ==========
const STORAGE_KEYS = {
    CONFIG: 'etf_sim_config',
    TRADES: 'etf_sim_trades',
    SNAPSHOTS: 'etf_sim_snapshots',
    POSITIONS: 'etf_sim_positions',
};

// ========== 配置管理 ==========
function getSimConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
        if (raw) return { ...DEFAULT_SIM_CONFIG, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SIM_CONFIG };
}

function saveSimConfig(config) {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
}

function resetSimConfig() {
    localStorage.removeItem(STORAGE_KEYS.CONFIG);
}

// ========== 交易记录 ==========
function getSimTrades() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.TRADES);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function saveSimTrades(trades) {
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
}

// ========== 每日快照 ==========
function getSimSnapshots() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SNAPSHOTS);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function saveSimSnapshots(snapshots) {
    localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
}

// ========== 持仓管理 ==========
function getSimPositions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.POSITIONS);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function saveSimPositions(positions) {
    localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(positions));
}

// ========== 重置模拟 ==========
function resetSimulation() {
    localStorage.removeItem(STORAGE_KEYS.TRADES);
    localStorage.removeItem(STORAGE_KEYS.SNAPSHOTS);
    localStorage.removeItem(STORAGE_KEYS.POSITIONS);
}

// ========== 核心引擎 ==========

/**
 * 初始化模拟
 */
function initSimulator(capital) {
    const config = getSimConfig();
    if (capital) {
        config.initialCapital = capital;
        saveSimConfig(config);
    }
    
    let positions = getSimPositions();
    let snapshots = getSimSnapshots();
    let trades = getSimTrades();
    
    // 首次初始化：创建起始快照
    if (snapshots.length === 0) {
        snapshots.push({
            date: 'init',
            cash: config.initialCapital,
            marketValue: 0,
            totalValue: config.initialCapital,
            dailyPnl: 0,
            totalPnl: 0,
            pnlPct: 0,
            benchmarkPct: 0,
            tradeCount: 0,
            winCount: 0,
        });
        saveSimSnapshots(snapshots);
    }
    
    return { config, positions, snapshots, trades };
}

/**
 * 每日结算：更新持仓市值
 * @param {Array} analysisData - API返回的完整分析数据 { etfs: [...] }
 */
function settleHoldings(analysisData, date) {
    let positions = getSimPositions();
    const config = getSimConfig();
    
    if (!analysisData || !analysisData.etfs) return positions;
    
    let totalMarketValue = 0;
    
    for (const pos of positions) {
        const etfData = analysisData.etfs.find(e => e.code === pos.code);
        if (etfData && etfData.latest) {
            pos.currentPrice = etfData.latest.c;
            pos.marketValue = pos.shares * pos.currentPrice;
            pos.pnl = (pos.currentPrice - pos.costPrice) * pos.shares;
            pos.pnlPct = pos.costPrice > 0 ? ((pos.currentPrice - pos.costPrice) / pos.costPrice * 100) : 0;
            pos.holdDays = (date && pos.buyDate) ? daysBetween(pos.buyDate, date) : pos.holdDays || 0;
            totalMarketValue += pos.marketValue;
        }
    }
    
    saveSimPositions(positions);
    
    // 计算总资产
    const snapshots = getSimSnapshots();
    const lastSnapshot = snapshots[snapshots.length - 1];
    const cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;
    const totalValue = cash + totalMarketValue;
    
    return { positions, totalValue, marketValue: totalMarketValue, cash };
}

/**
 * 检查卖出信号
 */
function checkSellSignals(positions, analysisData) {
    const config = getSimConfig();
    const suggestions = [];
    
    if (!analysisData || !analysisData.etfs) return suggestions;
    
    for (const pos of positions) {
        const etfData = analysisData.etfs.find(e => e.code === pos.code);
        if (!etfData || !etfData.latest) continue;
        
        const latest = etfData.latest;
        
        // ① 硬止损：亏损 > 5%
        if (pos.pnlPct <= config.stopLossPct * 100) {
            suggestions.push({
                code: pos.code,
                name: etfData.name,
                action: 'SELL',
                reason: `硬止损触发: 亏损${pos.pnlPct.toFixed(1)}%`,
                priority: 1,
                urgent: true,
            });
            continue;
        }
        
        // ② 信号止损：综合概率 < 40%
        if (latest.cp < config.signalSellPct * 100) {
            suggestions.push({
                code: pos.code,
                name: etfData.name,
                action: 'SELL',
                reason: `信号消退: 综合概率降至${latest.cp.toFixed(0)}%`,
                priority: 2,
                urgent: false,
            });
            continue;
        }
        
        // ③ 时间止损：持有>10天且未盈利
        if (pos.holdDays >= config.timeStopDays && pos.pnl <= 0) {
            suggestions.push({
                code: pos.code,
                name: etfData.name,
                action: 'SELL',
                reason: `时间止损: 持有${pos.holdDays}天未盈利`,
                priority: 3,
                urgent: false,
            });
            continue;
        }
    }
    
    return suggestions;
}

/**
 * 检查买入信号
 */
function checkBuySignals(analysisData, cash, positions) {
    const config = getSimConfig();
    const suggestions = [];
    
    if (!analysisData || !analysisData.etfs) return suggestions;
    
    const totalValue = cash + positions.reduce((s, p) => s + (p.marketValue || 0), 0);
    const usedRatio = (totalValue - cash) / totalValue;
    
    // 总仓位已达上限
    if (usedRatio >= config.maxTotalPct) return suggestions;
    
    const highSignals = analysisData.etfs.filter(e => e.latest && e.latest.cp >= 70);
    const midSignals = analysisData.etfs.filter(e => e.latest && e.latest.cp >= 50 && e.latest.cp < 70);
    
    // 策略: 信号波段 — 多ETF共振优先，单只高确信也可触发
    const hs300Codes = ['510300', '510310', '510330', '159919'];
    const hs300High = highSignals.filter(e => hs300Codes.includes(e.code));
    
    // 按综合概率降序排列
    highSignals.sort((a, b) => b.latest.cp - a.latest.cp);
    midSignals.sort((a, b) => b.latest.cp - a.latest.cp);
    
    if (highSignals.length >= 3) {
        // 多ETF共振 → 买入信号最强的那只
        const best = highSignals[0];
        if (!positions.find(p => p.code === best.code)) {
            suggestions.push({
                code: best.code,
                name: best.name,
                action: 'BUY',
                reason: `多ETF共振: ${highSignals.length}只同时触发高确信`,
                priority: 1,
            });
        }
    } else if (hs300High.length >= 2) {
        // 沪深300交叉验证
        const best = hs300High.sort((a, b) => b.latest.cp - a.latest.cp)[0];
        if (!positions.find(p => p.code === best.code)) {
            suggestions.push({
                code: best.code,
                name: best.name,
                action: 'BUY',
                reason: `沪深300交叉验证: ${hs300High.length}/4只同步`,
                priority: 2,
            });
        }
    } else if (highSignals.length >= 1) {
        // 单只高确信也可建议（降低门槛）
        const best = highSignals[0];
        if (!positions.find(p => p.code === best.code)) {
            suggestions.push({
                code: best.code,
                name: best.name,
                action: 'BUY',
                reason: `高确信信号: 综合概率${best.latest.cp.toFixed(0)}%`,
                priority: 3,
            });
        }
    }
    
    // 中等信号：≥2只同时触发也建议
    if (midSignals.length >= 2) {
        const best = midSignals[0];
        if (!positions.find(p => p.code === best.code) && !suggestions.find(s => s.code === best.code)) {
            suggestions.push({
                code: best.code,
                name: best.name,
                action: 'BUY',
                reason: `中等信号聚集: ${midSignals.length}只同时触发`,
                priority: 4,
            });
        }
    }
    
    // 单只中等信号且未持仓也可提示（最宽松条件）
    if (suggestions.length === 0 && midSignals.length >= 1) {
        const best = midSignals[0];
        if (!positions.find(p => p.code === best.code)) {
            suggestions.push({
                code: best.code,
                name: best.name,
                action: 'BUY',
                reason: `中等信号: 综合概率${best.latest.cp.toFixed(0)}%，值得关注`,
                priority: 5,
            });
        }
    }
    
    return suggestions;
}

/**
 * 执行交易
 */
function executeTrade(suggestion, price, date) {
    const config = getSimConfig();
    let trades = getSimTrades();
    let positions = getSimPositions();
    let snapshots = getSimSnapshots();
    const lastSnapshot = snapshots[snapshots.length - 1];
    let cash = lastSnapshot ? lastSnapshot.cash : config.initialCapital;
    
    if (suggestion.action === 'BUY') {
        // 计算买入股数
        const totalValue = cash + positions.reduce((s, p) => s + (p.marketValue || 0), 0);
        const maxBuyAmount = totalValue * config.positionRatio;
        // 单只上限
        const maxSingleAmount = totalValue * config.maxSinglePct;
        const buyAmount = Math.min(maxBuyAmount, maxSingleAmount, cash);
        const fee = Math.max(5, buyAmount * config.feeRate); // 最低5元
        const actualAmount = buyAmount - fee;
        const shares = Math.floor(actualAmount / price / 100) * 100; // 100的整数倍
        
        if (shares < 100) return null; // 不够买1手
        
        const cost = shares * price + fee;
        cash -= cost;
        
        // 添加到持仓
        positions.push({
            code: suggestion.code,
            name: suggestion.name,
            shares: shares,
            costPrice: price,
            currentPrice: price,
            marketValue: shares * price,
            pnl: 0,
            pnlPct: 0,
            holdDays: 0,
            buyDate: date,
        });
        
        // 记录交易
        trades.push({
            id: Date.now(),
            date: date,
            code: suggestion.code,
            name: suggestion.name,
            action: 'BUY',
            price: price,
            shares: shares,
            amount: cost,
            fee: fee,
            signal: suggestion.reason,
        });
        
    } else if (suggestion.action === 'SELL') {
        const pos = positions.find(p => p.code === suggestion.code);
        if (!pos) return null;
        
        const income = pos.shares * price;
        const fee = Math.max(5, income * config.feeRate);
        const actualIncome = income - fee;
        const pnl = actualIncome - pos.shares * pos.costPrice;
        
        cash += actualIncome;
        
        // 记录交易
        trades.push({
            id: Date.now(),
            date: date,
            code: suggestion.code,
            name: suggestion.name,
            action: 'SELL',
            price: price,
            shares: pos.shares,
            amount: actualIncome,
            fee: fee,
            pnl: pnl,
            signal: suggestion.reason,
            holdDays: pos.holdDays,
        });
        
        // 移除持仓
        positions = positions.filter(p => p.code !== suggestion.code);
    }
    
    // 更新快照
    const marketValue = positions.reduce((s, p) => s + (p.marketValue || 0), 0);
    const totalValue = cash + marketValue;
    const winRate = calcWinRate(trades);
    
    snapshots.push({
        date: date,
        cash: Math.round(cash * 100) / 100,
        marketValue: Math.round(marketValue * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        dailyPnl: 0,
        totalPnl: Math.round((totalValue - config.initialCapital) * 100) / 100,
        pnlPct: calcTotalReturn(totalValue, config.initialCapital),
        benchmarkPct: 0, // 由外部更新
        tradeCount: trades.length,
        winCount: winRate.winCount,
    });
    
    saveSimTrades(trades);
    saveSimPositions(positions);
    saveSimSnapshots(snapshots);
    
    return { trades, positions, snapshots, cash, totalValue };
}

/**
 * 计算日期差（天数）
 */
function daysBetween(dateStr1, dateStr2) {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}