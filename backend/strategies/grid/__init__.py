"""
ETF网格交易策略 — 策略入口
"""
from strategies.base import BaseStrategy
from strategies import register
from .config import DEFAULT_CONFIG
from .engine import calc_grid_params, calc_initial_position, check_grid_triggers
from .backtest import run_grid_backtest
from .analyze import analyze_grid


class GridStrategy(BaseStrategy):
    id = "grid"
    name = "ETF网格交易"
    description = "区间内机械式高抛低吸，适合震荡市，回撤可控"
    DEFAULT_CONFIG = DEFAULT_CONFIG

    def compute_factors(self, kline_data, idx_data=None, **kwargs):
        """原始K线 → 网格参数"""
        config = {**self.DEFAULT_CONFIG, **kwargs}
        params = calc_grid_params(kline_data, config)
        position = calc_initial_position(params, config)
        return {
            "grid_params": params,
            "initial_position": position,
        }

    def generate_signals(self, factors, config):
        """网格因子 → 交易信号"""
        grid_params = factors.get("grid_params") if factors else None
        if not grid_params:
            return []
        signals = []
        for gl in grid_params.get("grid_lines", []):
            signals.append({
                "level": gl["level"],
                "price": gl["price"],
                "pct_from_current": gl.get("pct_from_current", 0),
            })
        return signals

    def run_backtest(self, etf_results=None, sorted_dates=None, date_map=None,
                     config=None, all_sorted_dates=None, kline_data=None):
        """网格回测 — 直接使用K线数据"""
        if kline_data:
            return run_grid_backtest(kline_data, config or self.DEFAULT_CONFIG)
        return {"error": "网格回测需要 kline_data 参数"}

    def analyze_each(self, etf_code, kline_data, config=None):
        """分析单只ETF的网格参数（供 /api/strategy/grid/analyze 调用）"""
        return analyze_grid(etf_code, kline_data, config or self.DEFAULT_CONFIG)


# 自动注册
register(GridStrategy())