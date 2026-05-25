/**
 * 策略注册表 — 管理所有可用策略
 */
const StrategyRegistry = {
    _strategies: {},

    register(strategyClass) {
        this._strategies[strategyClass.id] = strategyClass;
    },

    list() {
        return Object.keys(this._strategies).map(id => ({
            id,
            name: this._strategies[id].name,
            description: this._strategies[id].description,
        }));
    },

    get(id) {
        return this._strategies[id] || this._strategies['three_factor'];
    },
};

// 当前活跃策略ID（由策略选择器设置）
let activeStrategyId = 'three_factor';

function getActiveStrategy() {
    return StrategyRegistry.get(activeStrategyId);
}

function setActiveStrategy(id) {
    if (activeStrategyId === id) return; // 同策略无需切换
    // 检测是否有旧策略的模拟盘数据，有则弹窗提示
    const oldTrades = getSimTrades();
    const oldPositions = getSimPositions();
    if (oldTrades.length > 0 || oldPositions.length > 0) {
        if (confirm('⚠️ 切换策略将清空当前模拟盘数据（持仓/交易记录/快照），是否继续？\n\n旧策略: ' + (StrategyRegistry.get(activeStrategyId).name) + '\n新策略: ' + (StrategyRegistry.get(id).name))) {
            resetSimulation();
        } else {
            return; // 用户取消切换
        }
    }
    activeStrategyId = id;
    localStorage.setItem('etf_active_strategy', id);
    // 刷新数据以加载新策略分析
    if (typeof doRefresh === 'function') {
        setTimeout(function() { doRefresh(); }, 200);
    }
}

// 恢复上次选择（延迟到 DOMContentLoaded 时由 initStrategySelector 执行）
