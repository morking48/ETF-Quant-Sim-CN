"""
ETF网格交易回测引擎
"""
import math
from datetime import datetime


def _days_between_b(date1, date2):
    """计算两个日期字符串之间的日历天数"""
    try:
        d1 = datetime.strptime(str(date1)[:10], '%Y-%m-%d')
        d2 = datetime.strptime(str(date2)[:10], '%Y-%m-%d')
        return abs((d1 - d2).days)
    except:
        return 99


def run_grid_backtest(kline_data, config, code="510300"):
    """
    运行网格策略回测

    参数:
        kline_data: [{date, o, c, h, l, v}] 按日期升序
        config: 网格配置参数
        code: ETF代码

    返回:
        {trades, metrics, grid_params}
    """
    if len(kline_data) < 60:
        return {"error": "K线数据不足（需至少60条）"}

    from .engine import calc_grid_params

    # 用前60条计算网格参数
    initial_period = kline_data[:60]
    grid_params = calc_grid_params(initial_period, config)
    if not grid_params:
        return {"error": "无法计算网格参数"}

    initial_capital = config.get("initial_capital", 300000)
    base_pct = config.get("base_position_pct", 50) / 100
    fee_rate = config.get("fee_rate", 0.00025)
    per_grid_shares = grid_params["per_grid_shares"]

    cash = initial_capital
    shares = 0
    filled_levels = set()  # 已填充的网格层
    trades = []
    equity_curve = []

    # 初始建仓：当前价以下全买，但限制在 base_position_pct
    base_capital = initial_capital * base_pct
    current_level = grid_params["current_level"]
    grid_lines = grid_params["grid_lines"]

    for gl in grid_lines:
        if gl["level"] <= current_level:
            buy_shares = min(per_grid_shares,
                           int((base_capital / (current_level + 1)) / gl["price"] / 100) * 100)
            if buy_shares >= 100:
                cost = buy_shares * gl["price"]
                fee = max(5, cost * fee_rate)
                actual_cost = cost + fee
                if actual_cost <= cash:
                    shares += buy_shares
                    cash -= actual_cost
                    filled_levels.add(gl["level"])
                    trades.append({
                        "date": kline_data[59]["date"],
                        "action": "BUY",
                        "level": gl["level"],
                        "price": gl["price"],
                        "shares": buy_shares,
                        "amount": round(actual_cost, 2),
                        "reason": f"初始建仓 网格 #{gl['level']}",
                    })

    equity_curve.append({
        "date": kline_data[59]["date"],
        "cash": round(cash, 2),
        "market_value": round(shares * kline_data[59]["c"], 2),
        "total_value": round(cash + shares * kline_data[59]["c"], 2),
    })

    # 逐日运行（收盘价确认 + 3天冷却期）
    last_trade_date = None
    for i in range(60, len(kline_data)):
        d = kline_data[i]
        price = d["c"]
        prev_price = kline_data[i - 1]["c"]

        # 3天冷却期检查：与上次交易相隔不足3天则跳过
        if last_trade_date and _days_between_b(d["date"], last_trade_date) < 3:
            mv = shares * price
            tv = cash + mv
            equity_curve.append({
                "date": d["date"],
                "cash": round(cash, 2),
                "market_value": round(mv, 2),
                "total_value": round(tv, 2),
            })
            continue

        # 检测网格穿越（收盘价确认）
        old_level = None
        new_level = None
        for gl in grid_lines:
            if gl["price"] <= prev_price:
                old_level = gl["level"]
            if gl["price"] <= price:
                new_level = gl["level"]

        day_traded = False
        if new_level is not None and old_level is not None:
            # 价格上涨：卖出已填充层
            if new_level > old_level:
                for lv in range(old_level + 1, min(new_level + 1, len(grid_lines))):
                    if lv in filled_levels:
                        sell_shares = per_grid_shares
                        if sell_shares <= shares:
                            income = sell_shares * price
                            fee = max(5, income * fee_rate)
                            actual_income = income - fee
                            shares -= sell_shares
                            cash += actual_income
                            filled_levels.discard(lv)
                            trades.append({
                                "date": d["date"],
                                "action": "SELL",
                                "level": lv,
                                "price": price,
                                "shares": sell_shares,
                                "amount": round(actual_income, 2),
                                "reason": f"突破网格上线 #{lv}",
                            })
                            day_traded = True

            # 价格下跌：买入新触及层
            elif new_level < old_level:
                for lv in range(old_level, new_level, -1):
                    if lv not in filled_levels:
                        buy_shares = per_grid_shares
                        cost = buy_shares * price
                        fee = max(5, cost * fee_rate)
                        actual_cost = cost + fee
                        if actual_cost <= cash:
                            shares += buy_shares
                            cash -= actual_cost
                            filled_levels.add(lv)
                            trades.append({
                                "date": d["date"],
                                "action": "BUY",
                                "level": lv,
                                "price": price,
                                "shares": buy_shares,
                                "amount": round(actual_cost, 2),
                                "reason": f"触及网格下线 #{lv}",
                            })
                            day_traded = True

        if day_traded:
            last_trade_date = d["date"]

        mv = shares * price
        tv = cash + mv
        equity_curve.append({
            "date": d["date"],
            "cash": round(cash, 2),
            "market_value": round(mv, 2),
            "total_value": round(tv, 2),
        })

    # 最终指标
    final_value = cash + shares * kline_data[-1]["c"]
    total_return = round((final_value - initial_capital) / initial_capital * 100, 2)

    buy_trades = [t for t in trades if t["action"] == "BUY"]
    sell_trades = [t for t in trades if t["action"] == "SELL"]
    win_trades = [
        t for t in trades
        if t["action"] == "SELL"
        and t.get("price", 0) > 0
    ]
    win_rate = round(len(win_trades) / len(sell_trades) * 100, 1) if sell_trades else 0

    # 最大回撤
    peak = equity_curve[0]["total_value"]
    max_dd = 0
    for ec in equity_curve:
        v = ec["total_value"]
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100 if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
    max_dd = round(max_dd, 2)

    # 夏普
    eq_vals = [e["total_value"] for e in equity_curve]
    daily_returns = []
    for j in range(1, len(eq_vals)):
        if eq_vals[j - 1] > 0:
            daily_returns.append((eq_vals[j] - eq_vals[j - 1]) / eq_vals[j - 1])
    if daily_returns and len(daily_returns) > 1:
        avg_ret = sum(daily_returns) / len(daily_returns)
        std_ret = (sum((r - avg_ret) ** 2 for r in daily_returns) / len(daily_returns)) ** 0.5
        sharpe = round(avg_ret / std_ret * (252 ** 0.5), 2) if std_ret > 0 else 0
    else:
        sharpe = 0

    return {
        "data_start_date": kline_data[0]["date"] if kline_data else "",
        "data_end_date": kline_data[-1]["date"] if kline_data else "",
        "initial_capital": initial_capital,
        "final_value": round(final_value, 2),
        "total_return": total_return,
        "total_trades": len(trades),
        "buy_count": len(buy_trades),
        "sell_count": len(sell_trades),
        "win_rate": win_rate,
        "max_drawdown": str(max_dd),
        "sharpe": str(sharpe),
        "grid_params": {
            "low": grid_params["grid_low"],
            "high": grid_params["grid_high"],
            "spacing": grid_params["spacing"],
            "layers": grid_params["layers"],
            "per_grid_shares": per_grid_shares,
        },
        "equity_curve": equity_curve[-20:],
        "trades": trades[-30:],
    }
