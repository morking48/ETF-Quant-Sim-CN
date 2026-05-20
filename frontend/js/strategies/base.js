/**
 * 策略基类 (JavaScript版)
 * 所有前端策略必须实现此接口
 */
class BaseStrategy {
    static id = '';
    static name = '';
    static description = '';
    static DEFAULT_CONFIG = {};

    /** 原始数据 → 策略因子 */
    computeFactors(rawData) { return {}; }

    /** 因子 → 交易信号 */
    generateSignals(factors, config) { return []; }

    /** 回测 */
    runLocalBacktest(data, config) { return {}; }

    /** 买入规则 */
    getBuySignals(signals, positions, cash, config) { return []; }

    /** 卖出规则 */
    getSellSignals(positions, signals, config) { return []; }
}