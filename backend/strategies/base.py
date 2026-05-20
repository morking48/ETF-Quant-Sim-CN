"""
策略基类 — 所有策略必须实现此接口
"""
from abc import ABC, abstractmethod


class BaseStrategy(ABC):
    """量化策略基类"""

    # --- 元信息（子类必须覆盖）---
    id: str = ''
    name: str = ''
    description: str = ''

    # --- 默认配置（子类可覆盖）---
    DEFAULT_CONFIG: dict = {}

    # ------------------------------------------------------------------
    # 因子计算
    # ------------------------------------------------------------------
    @abstractmethod
    def compute_factors(self, kline_data, idx_data=None, **kwargs):
        """原始K线 → 策略因子"""
        ...

    # ------------------------------------------------------------------
    # 信号生成
    # ------------------------------------------------------------------
    @abstractmethod
    def generate_signals(self, factors, config: dict):
        """因子 → 交易信号列表"""
        ...

    # ------------------------------------------------------------------
    # 回测
    # ------------------------------------------------------------------
    @abstractmethod
    def run_backtest(self, etf_codes, date_range, config, share_data=None):
        """历史回测 → {trades, metrics, equity_curve}"""
        ...

    # ------------------------------------------------------------------
    # 交易规则（供模拟盘调用）
    # ------------------------------------------------------------------
    def get_buy_conditions(self, signals, positions, cash, config):
        """当前信号 → 买入建议列表"""
        return []

    def get_sell_conditions(self, positions, signals, config):
        """当前持仓 → 卖出建议列表"""
        return []