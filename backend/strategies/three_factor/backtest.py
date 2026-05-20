"""
三因子信号波段回测引擎（从 server.py /api/backtest 抽出）
"""
import math
from datetime import datetime, timedelta


def compute_backtest_metrics(trades, equity_curve, initial_capital):
    """从交易记录和权益曲线计算统计指标"""
    sell_trades = [t for t in trades if t["action"] == "SELL"]
    buy_trades = [t for t in trades if t["action"] == "BUY"]
    win_trades = [t for t in sell_trades if t.get("pnl", 0) > 0]
    win_rate = round(len(win_trades) / len(sell_trades) * 100, 1) if sell_trades else 0

    # 最大回撤
    peak = equity_curve[0]
    max_dd = 0
    for v in equity_curve:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100 if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
    max_dd = round(max_dd, 2)

    # 夏普比率
    daily_returns = []
    for i in range(1, len(equity_curve)):
        if equity_curve[i - 1] > 0:
            daily_returns.append((equity_curve[i] - equity_curve[i - 1]) / equity_curve[i - 1])
    if daily_returns:
        avg_ret = sum(daily_returns) / len(daily_returns)
        std_ret = (sum((r - avg_ret) ** 2 for r in daily_returns) / len(daily_returns)) ** 0.5
        sharpe = round(avg_ret / std_ret * (252 ** 0.5), 2) if std_ret > 0 else 0
    else:
        sharpe = 0

    final_value = equity_curve[-1] if equity_curve else initial_capital
    total_return = round((final_value - initial_capital) / initial_capital * 100, 2)

    return {
        "final_value": round(final_value, 2),
        "total_return": total_return,
        "total_trades": len(trades),
        "buy_count": len(buy_trades),
        "sell_count": len(sell_trades),
        "win_count": len(win_trades),
        "win_rate": win_rate,
        "max_drawdown": str(max_dd),
        "sharpe": str(sharpe),
    }


def run_backtest(etf_results, sorted_dates, date_map, config, all_sorted_dates):
    """
    运行三因子信号波段回测

    参数:
        etf_results: [{code, name, history[{d, c, cp, signal}]}]
        sorted_dates: 回测日期范围（已过滤）
        date_map: {date: {code: history_row}}
        config: 策略配置参数
        all_sorted_dates: 全部可用日期（用于输出数据区间）

    返回: {start_date, end_date, initial_capital, final_value, ...}
    """
    initial_capital = config.get("initial_capital", 100000)
    position_ratio = config.get("position_ratio", 0.30)
    buy_threshold = config.get("buy_threshold", 70)
    fee_rate = config.get("fee_rate", 0.00025)
    stop_loss_pct = config.get("stop_loss_pct", -0.05)
    signal_sell_pct = config.get("signal_sell_pct", 0.40)
    time_stop_days = config.get("time_stop_days", 10)

    cash = initial_capital
    positions = {}  # {code: {shares, cost_price, current_price, market_value, hold_days}}
    trades = []

    for d in sorted_dates:
        day_data = date_map[d]

        # 结算持仓市值
        total_mv = 0
        for code, pos in list(positions.items()):
            if code in day_data:
                pos["current_price"] = day_data[code]["c"]
                pos["market_value"] = pos["shares"] * pos["current_price"]
                total_mv += pos["market_value"]
                pos["hold_days"] = pos.get("hold_days", 0) + 1

        # 检查卖出信号
        for code, pos in list(positions.items()):
            if code not in day_data:
                continue
            h = day_data[code]
            sell_reason = None
            pnl_pct = (pos["current_price"] - pos["cost_price"]) / pos["cost_price"] * 100 if pos["cost_price"] > 0 else 0

            # 硬止损 -5%
            if pnl_pct <= stop_loss_pct * 100:
                sell_reason = f"硬止损: 亏损{pnl_pct:.1f}%"
            # 信号消退 < 40%
            elif h["cp"] < signal_sell_pct * 100:
                sell_reason = f"信号消退: CP={h['cp']:.0f}%"
            # 时间止损 > 10天未盈利
            elif pos.get("hold_days", 0) >= time_stop_days and pnl_pct <= 0:
                sell_reason = f"时间止损: 持有{pos['hold_days']}天未盈利"

            if sell_reason:
                shares = pos["shares"]
                income = shares * pos["current_price"]
                fee = max(5, income * fee_rate)
                actual_income = income - fee
                pnl = actual_income - shares * pos["cost_price"]
                cash += actual_income
                trades.append({
                    "date": d, "action": "SELL", "code": code,
                    "price": round(pos["current_price"], 3), "shares": int(shares),
                    "amount": round(actual_income, 2), "fee": round(fee, 2),
                    "pnl": round(pnl, 2), "reason": sell_reason,
                    "hold_days": pos.get("hold_days", 0)
                })
                del positions[code]

        # 检查买入信号
        total_value = cash + sum(p.get("market_value", 0) for p in positions.values())
        used_ratio = (total_value - cash) / total_value if total_value > 0 else 0

        if used_ratio < 0.80:  # 总仓位 < 80%
            eligible = []
            for code, h in day_data.items():
                if code in positions:
                    continue
                if h["cp"] >= buy_threshold:
                    eligible.append((code, h))

            if eligible:
                # 买信号最强的1只
                code, h = max(eligible, key=lambda x: x[1]["cp"])
                max_buy = min(total_value * position_ratio, cash * 0.95)
                fee = max(5, max_buy * fee_rate)
                shares = math.floor((max_buy - fee) / h["c"] / 100) * 100
                if shares >= 100:
                    cost = shares * h["c"] + fee
                    cash -= cost
                    positions[code] = {
                        "shares": shares,
                        "cost_price": h["c"],
                        "current_price": h["c"],
                        "market_value": shares * h["c"],
                        "hold_days": 0
                    }
                    trades.append({
                        "date": d, "action": "BUY", "code": code,
                        "price": round(h["c"], 3), "shares": int(shares),
                        "amount": round(cost, 2), "fee": round(fee, 2),
                        "reason": f"三因子高确信: CP={h['cp']:.0f}%"
                    })

    # 最终结算
    final_mv = sum(p.get("market_value", 0) for p in positions.values())
    final_value = cash + final_mv

    # 构建权益曲线
    eq = [initial_capital]
    cash_tmp = initial_capital
    pos_tmp = {}
    for d in sorted_dates:
        day_data = date_map[d]
        for code, pos in pos_tmp.items():
            if code in day_data:
                pos["mv"] = pos["shares"] * day_data[code]["c"]
        for t in trades:
            if t["date"] == d:
                if t["action"] == "BUY":
                    cash_tmp -= t["amount"]
                    pos_tmp[t["code"]] = {"shares": t["shares"], "mv": t["shares"] * t["price"]}
                elif t["action"] == "SELL" and t["code"] in pos_tmp:
                    cash_tmp += t["amount"]
                    del pos_tmp[t["code"]]
        eq.append(cash_tmp + sum(p["mv"] for p in pos_tmp.values()))

    # 计算指标
    metrics = compute_backtest_metrics(trades, eq, initial_capital)

    return {
        "start_date": sorted_dates[0] if sorted_dates else "",
        "end_date": sorted_dates[-1] if sorted_dates else "",
        "data_start_date": all_sorted_dates[0] if all_sorted_dates else "",
        "data_end_date": all_sorted_dates[-1] if all_sorted_dates else "",
        "warning": "",
        "initial_capital": initial_capital,
        **metrics,
        "trades": trades[:20]
    }