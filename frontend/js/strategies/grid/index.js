/**
 * ETF网格交易策略 — 前端入口
 */
class GridStrategy extends BaseStrategy {
    static id = 'grid';
    static name = 'ETF网格交易';
    static description = '区间内机械式高抛低吸，震荡市利器，回撤可控';
    static DEFAULT_CONFIG = GRID_DEFAULT_CONFIG;

    computeFactors(rawData) {
        return rawData;
    }

    generateSignals(factors, config) {
        // 网格在前端不生成信号（由后端回测计算）
        return [];
    }

    getBuySignals(signals, positions, cash, config) {
        // 网格策略的买入建议 = 检查持仓中的网格层级
        const suggestions = [];
        if (!positions || !positions.length) {
            suggestions.push({
                code: '510300', name: '沪深300ETF', action: 'BUY',
                reason: '网格策略: 建议启动网格交易（30万本金，60日高低点区间，间距4.0%）',
                priority: 1
            });
        }
        return suggestions;
    }

    getSellSignals(positions, signals, config) {
        // 网格策略卖出信号由 sim_ui.js 的 generateGridSuggestions 统一处理
        // 此处返回空，避免重复触发冲突逻辑
        return [];
    }
}

StrategyRegistry.register(GridStrategy);