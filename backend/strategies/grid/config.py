"""
ETF网格交易策略 — 默认配置
"""

DEFAULT_CONFIG = {
    # 资金设置
    "initial_capital": 300000,       # 总资金（元），默认30万

    # 网格区间
    "grid_range_mode": "auto",       # auto | manual
    "grid_low": None,                # 手动下沿（manual模式）
    "grid_high": None,               # 手动上沿（manual模式）
    "grid_range_pct": 10,            # 自动区间：当前价±10%

    # 网格间距
    "grid_spacing_pct": 4.0,         # 网格间距（%），2~3倍ATR，避免日内噪音反复触发
    "grid_spacing_mode": "pct",      # pct | fixed

    # 仓位
    "base_position_pct": 50,         # 底仓比例（%），初始建仓
    "reserve_pct": 10,               # 预留现金（%），不下网格

    # 手续费
    "fee_rate": 0.00025,             # 万2.5
}