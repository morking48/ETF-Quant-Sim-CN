"""
网格策略分析模块
为7只ETF计算网格参数、价格位置、波动率
"""
import math
from datetime import datetime
from .engine import calc_grid_params


def _days_between(date1, date2):
    """计算两个日期字符串之间的日历天数"""
    try:
        d1 = datetime.strptime(str(date1)[:10], '%Y-%m-%d')
        d2 = datetime.strptime(str(date2)[:10], '%Y-%m-%d')
        return abs((d1 - d2).days)
    except:
        return 99  # 解析失败时保守处理：允许信号


def analyze_grid(etf_code, kline_data, config=None):
    """
    对单只ETF做网格分析
    返回：网格参数 + 价格位置 + 波动率 + 当前建议
    """
    if config is None:
        from .config import DEFAULT_CONFIG
        config = DEFAULT_CONFIG

    if not kline_data or len(kline_data) < 20:
        return {"code": etf_code, "error": "K线数据不足（需≥20条）"}

    # 当前价格
    current = kline_data[-1]
    price = current["c"]
    prev = kline_data[-2] if len(kline_data) >= 2 else current
    change_pct = round((price - prev["c"]) / prev["c"] * 100, 2) if prev["c"] > 0 else 0

    # 计算网格
    grid = calc_grid_params(kline_data, config)

    # 计算价格在网格中的位置（0=底部, 100=顶部）
    if grid["grid_high"] > grid["grid_low"]:
        position_pct = round((price - grid["grid_low"]) / (grid["grid_high"] - grid["grid_low"]) * 100, 1)
        position_pct = max(0, min(100, position_pct))
    else:
        position_pct = 50

    # 价格所在层级
    level = math.floor((price - grid["grid_low"]) / grid["spacing"]) + 1 if grid["spacing"] > 0 else 0
    level = max(1, min(grid["layers"], level))

    # 最近网格交易信号（收盘价确认 + 日内去重：每天最多1个信号）
    recent_signal = None
    last_signal_date = None
    for i in range(len(kline_data) - 1, max(0, len(kline_data) - 60), -1):
        d = kline_data[i]
        prv = kline_data[i - 1] if i > 0 else d
        day_signals = []  # 收集当日所有穿越
        for gl in grid.get("grid_lines", []):
            lp = gl["price"]
            # 上穿 = 卖出（收盘价确认：前一收盘<网格线 ≤ 当前收盘）
            if prv["c"] < lp <= d["c"]:
                day_signals.append({"date": d["date"], "action": "SELL",
                    "price": round(d["c"], 3), "line": lp, "cross_pct": round(abs(d["c"] - lp) / lp * 100, 2)})
            # 下穿 = 买入（收盘价确认：前一收盘>网格线 ≥ 当前收盘）
            if prv["c"] > lp >= d["c"]:
                day_signals.append({"date": d["date"], "action": "BUY",
                    "price": round(d["c"], 3), "line": lp, "cross_pct": round(abs(d["c"] - lp) / lp * 100, 2)})
        # 日内去重：取穿越幅度最大的那个信号，且与上次信号相隔≥3天
        if day_signals:
            best = max(day_signals, key=lambda s: s["cross_pct"])
            if last_signal_date is None or _days_between(best["date"], last_signal_date) >= 3:
                if not recent_signal or best["date"] > recent_signal["date"]:
                    recent_signal = best
                    last_signal_date = best["date"]

    # 波动率（60日年化）
    returns = []
    for i in range(1, min(60, len(kline_data))):
        if kline_data[-i - 1]["c"] > 0:
            r = math.log(kline_data[-i]["c"] / kline_data[-i - 1]["c"])
            returns.append(r)
    if returns:
        daily_std = (sum((r - sum(returns) / len(returns)) ** 2 for r in returns) / len(returns)) ** 0.5
        annual_vol = round(daily_std * (252 ** 0.5) * 100, 1)
    else:
        annual_vol = 0

    # 震荡市判断（区间波动率 vs 趋势）
    prices_60 = [d["c"] for d in kline_data[-60:]] if len(kline_data) >= 60 else [d["c"] for d in kline_data]
    range_pct = (max(prices_60) - min(prices_60)) / min(prices_60) * 100 if min(prices_60) > 0 else 0
    is_range_bound = range_pct < 15  # 60日振幅<15% = 震荡市

    # 建议
    if position_pct <= 20:
        suggestion = "📗 价格处于区间底部，建议增持"
        suggestion_color = "signal-low"
    elif position_pct >= 80:
        suggestion = "📕 价格处于区间顶部，建议减持"
        suggestion_color = "signal-high"
    elif 40 <= position_pct <= 60:
        suggestion = "📘 价格处于区间中部，正常网格运行"
        suggestion_color = "signal-mid"
    else:
        suggestion = "📙 价格偏离中枢，注意调整网格"
        suggestion_color = "signal-mid"

    return {
        "code": etf_code,
        "price": round(price, 3),
        "change_pct": change_pct,
        "grid": {
            "low": round(grid["grid_low"], 3),
            "high": round(grid["grid_high"], 3),
            "layers": grid["layers"],
            "spacing": round(grid["spacing"], 3),
            "per_grid_value": round(grid.get("per_grid_shares", 0) * price, 0) if grid.get("per_grid_shares") else 0,
        },
        "position_pct": position_pct,
        "current_level": level,
        "annual_vol": annual_vol,
        "range_pct_60d": round(range_pct, 1),
        "is_range_bound": is_range_bound,
        "recent_signal": recent_signal,
        "suggestion": suggestion,
        "suggestion_color": suggestion_color,
    }