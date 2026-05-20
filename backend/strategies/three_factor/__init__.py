"""
三因子ETF监测策略 — 策略入口
"""
from strategies.base import BaseStrategy
from strategies import register
from .config import DEFAULT_CONFIG
from .factors import vprob, dprob, sprob, calc_composite, get_signal_level
from .engine import analyze_single, align_idx, analyze_etfs
from .backtest import run_backtest, compute_backtest_metrics


class ThreeFactorStrategy(BaseStrategy):
    id = "three_factor"
    name = "三因子ETF监测"
    description = "量能50% + 方向20% + 份额30%，追踪国家队ETF操作信号"
    DEFAULT_CONFIG = DEFAULT_CONFIG

    def compute_factors(self, kline_data, idx_data=None, **kwargs):
        """原始K线 → 三因子"""
        return {}

    def generate_signals(self, factors, config):
        return []

    def run_backtest(self, etf_results, sorted_dates, date_map, config, all_sorted_dates):
        """代理到 backtest.run_backtest"""
        return run_backtest(etf_results, sorted_dates, date_map, config, all_sorted_dates)


# 自动注册
register(ThreeFactorStrategy())