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
    activeStrategyId = id;
    localStorage.setItem('etf_active_strategy', id);
}

// 恢复上次选择（延迟到 DOMContentLoaded 时由 initStrategySelector 执行）
