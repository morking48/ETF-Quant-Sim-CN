"""
数据层 — K线获取 + 份额获取（从 server.py 独立）
"""
from .kline import fetch_kline
from .shares import fetch_share_history, get_share_data_with_cache