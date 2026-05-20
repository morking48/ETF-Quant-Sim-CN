/**
 * 三因子ETF监测策略 — 前端入口
 * 注册到全局策略注册表
 */
class ThreeFactorStrategy extends BaseStrategy {
    static id = 'three_factor';
    static name = '三因子ETF监测';
    static description = '量能50% + 方向20% + 份额30%，追踪国家队ETF操作信号';
    static DEFAULT_CONFIG = THREE_FACTOR_DEFAULT_CONFIG;

    computeFactors(rawData) {
        // 三因子使用后端 /api/analysis 计算，前端仅展示
        return rawData;
    }

    generateSignals(factors, config) {
        if (!factors || !factors.etfs) return [];
        return factors.etfs
            .filter(e => e.latest)
            .map(e => ({
                code: e.code,
                name: e.name,
                cp: e.latest.cp,
                signal: e.latest.signal,
                price: e.latest.c,
            }));
    }

    getBuySignals(signals, positions, cash, config) {
        const suggestions = [];
        if (!signals || !signals.length) return suggestions;

        const totalValue = cash + positions.reduce((s, p) => s + (p.marketValue || 0), 0);
        const usedRatio = (totalValue - cash) / totalValue;
        if (usedRatio >= config.maxTotalPct) return suggestions;

        const highSignals = signals.filter(s => s.cp >= 70);
        const midSignals = signals.filter(s => s.cp >= 50 && s.cp < 70);
        const hs300Codes = ['510300', '510310', '510330', '159919'];
        const hs300High = highSignals.filter(s => hs300Codes.includes(s.code));

        highSignals.sort((a, b) => b.cp - a.cp);
        midSignals.sort((a, b) => b.cp - a.cp);

        if (highSignals.length >= 3) {
            const best = highSignals[0];
            if (!positions.find(p => p.code === best.code)) {
                suggestions.push({ code: best.code, name: best.name, action: 'BUY',
                    reason: `多ETF共振: ${highSignals.length}只同时触发高确信`, priority: 1 });
            }
        } else if (hs300High.length >= 2) {
            const best = hs300High[0];
            if (!positions.find(p => p.code === best.code)) {
                suggestions.push({ code: best.code, name: best.name, action: 'BUY',
                    reason: `沪深300交叉验证: ${hs300High.length}/4只同步`, priority: 2 });
            }
        } else if (highSignals.length >= 1) {
            const best = highSignals[0];
            if (!positions.find(p => p.code === best.code)) {
                suggestions.push({ code: best.code, name: best.name, action: 'BUY',
                    reason: `高确信信号: 综合概率${best.cp.toFixed(0)}%`, priority: 3 });
            }
        }
        if (midSignals.length >= 2) {
            const best = midSignals[0];
            if (!positions.find(p => p.code === best.code) && !suggestions.find(s => s.code === best.code)) {
                suggestions.push({ code: best.code, name: best.name, action: 'BUY',
                    reason: `中等信号聚集: ${midSignals.length}只同时触发`, priority: 4 });
            }
        }
        if (suggestions.length === 0 && midSignals.length >= 1) {
            const best = midSignals[0];
            if (!positions.find(p => p.code === best.code)) {
                suggestions.push({ code: best.code, name: best.name, action: 'BUY',
                    reason: `中等信号: 综合概率${best.cp.toFixed(0)}%`, priority: 5 });
            }
        }
        return suggestions;
    }

    getSellSignals(positions, signals, config) {
        const suggestions = [];
        for (const pos of positions) {
            const sig = signals.find(s => s.code === pos.code);
            if (!sig) continue;
            if (pos.pnlPct <= config.stopLossPct * 100) {
                suggestions.push({ code: pos.code, name: pos.name, action: 'SELL',
                    reason: `硬止损: 亏损${pos.pnlPct.toFixed(1)}%`, priority: 1, urgent: true });
                continue;
            }
            if (sig.cp < config.signalSellPct * 100) {
                suggestions.push({ code: pos.code, name: pos.name, action: 'SELL',
                    reason: `信号消退: 综合概率降至${sig.cp.toFixed(0)}%`, priority: 2 });
                continue;
            }
            if (pos.holdDays >= config.timeStopDays && pos.pnl <= 0) {
                suggestions.push({ code: pos.code, name: pos.name, action: 'SELL',
                    reason: `时间止损: 持有${pos.holdDays}天未盈利`, priority: 3 });
            }
        }
        return suggestions;
    }
}

// 自动注册
StrategyRegistry.register(ThreeFactorStrategy);