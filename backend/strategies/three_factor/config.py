"""
三因子ETF监测策略 — 默认配置
"""

DEFAULT_CONFIG = {
    # 回测参数
    "initial_capital": 100000,       # 初始资金
    "position_ratio": 0.30,          # 首次建仓比例
    "buy_threshold": 70,             # 买入信号阈值 (cp >= 70)
    "fee_rate": 0.00025,             # 手续费率 万2.5

    # 卖出规则
    "stop_loss_pct": -0.05,          # 硬止损线 -5%
    "signal_sell_pct": 0.40,         # 信号卖出阈值 (cp < 40)
    "time_stop_days": 10,            # 时间止损天数

    # 仓位控制
    "max_total_pct": 0.80,           # 总仓位上限 80%
    "max_positions": 4,              # 最大持仓数

    # 分析参数
    "days": 35,                      # 分析天数
    "kline_limit": 250,              # K线拉取上限
}