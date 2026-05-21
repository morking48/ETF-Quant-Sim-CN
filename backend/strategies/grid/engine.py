"""
ETF网格交易引擎 — 计算网格表、触发价格
"""
import math


def calc_grid_params(kline_data, config):
    """
    从历史K线计算网格参数

    参数:
        kline_data: [{date, o, c, h, l, v}]
        config: 网格配置

    返回:
        {grid_low, grid_high, spacing, layers, grid_lines, current_price}
    """
    if not kline_data:
        return None

    latest = kline_data[-1]
    current_price = latest["c"]

    if config.get("grid_range_mode") == "manual":
        grid_low = config.get("grid_low") or current_price * 0.90
        grid_high = config.get("grid_high") or current_price * 1.10
    else:
        # 自动模式：用前60天最高/最低价定区间，确保网格线固定、position_pct真实变化
        prices_60 = [d["c"] for d in kline_data[-60:]] if len(kline_data) >= 60 else [d["c"] for d in kline_data]
        grid_low = min(prices_60)
        grid_high = max(prices_60)
        # 如果区间过宽/过窄，用range_pct做约束
        range_pct = config.get("grid_range_pct", 10) / 100
        center = (grid_low + grid_high) / 2
        min_half = center * range_pct
        actual_half = max(grid_high - center, center - grid_low)
        if actual_half < min_half:
            # 60日振幅太小，扩展到range_pct
            grid_low = center * (1 - range_pct)
            grid_high = center * (1 + range_pct)

    # 间距
    if config.get("grid_spacing_mode") == "fixed":
        spacing = config.get("grid_fixed_spacing", 0.05)
        layers = int((grid_high - grid_low) / spacing) + 1
    else:
        spacing_pct = config.get("grid_spacing_pct", 4.0) / 100
        spacing = current_price * spacing_pct
        layers = int((grid_high - grid_low) / spacing) + 1

    layers = max(3, min(layers, 50))  # 限制 3-50 层

    # 生成网格线
    grid_lines = []
    for i in range(layers):
        price = round(grid_low + spacing * i, 3)
        grid_lines.append({
            "level": i,
            "price": price,
            "pct_from_current": round((price - current_price) / current_price * 100, 2),
        })

    # 每格资金
    base_capital = config.get("initial_capital", 300000)
    grid_capital = base_capital * (1 - config.get("reserve_pct", 10) / 100)
    per_grid_capital = round(grid_capital / layers, 2)

    # 当前价所在层
    current_level = None
    for gl in grid_lines:
        if gl["price"] <= current_price:
            current_level = gl["level"]

    return {
        "grid_low": round(grid_low, 3),
        "grid_high": round(grid_high, 3),
        "spacing": round(spacing, 3),
        "layers": layers,
        "grid_lines": grid_lines,
        "current_price": current_price,
        "current_level": current_level,
        "per_grid_capital": per_grid_capital,
        "per_grid_shares": round(per_grid_capital / current_price / 100) * 100,
    }


def calc_initial_position(grid_params, config):
    """
    计算初始建仓：当前价所在层及以下全部买入作为底仓

    返回:
        {total_shares, total_cost, base_levels, buy_plan: [{level, price, shares, cost}]}
    """
    if not grid_params:
        return None

    current_level = grid_params["current_level"]
    grid_lines = grid_params["grid_lines"]
    base_pct = config.get("base_position_pct", 50) / 100
    total_capital = config.get("initial_capital", 300000)
    base_capital = total_capital * base_pct

    buy_plan = []
    for gl in grid_lines:
        if gl["level"] <= current_level:
            shares = round(
                grid_params["per_grid_capital"] / gl["price"] / 100
            ) * 100
            buy_plan.append({
                "level": gl["level"],
                "price": gl["price"],
                "shares": shares,
                "cost": round(shares * gl["price"], 2),
            })

    total_shares = sum(p["shares"] for p in buy_plan)
    total_cost = sum(p["cost"] for p in buy_plan)

    return {
        "total_shares": total_shares,
        "total_cost": round(total_cost, 2),
        "base_levels": len(buy_plan),
        "buy_plan": buy_plan,
    }


def check_grid_triggers(kline_data, positions, grid_params, prev_data=None):
    """
    检查是否有价格穿越网格线

    参数:
        kline_data: 完整K线（最新一条是当日）
        positions: {code: {shares, filled_levels: set()}}
        grid_params: calc_grid_params 返回值
        prev_data: 上一日K线 {o, c, h, l}（用于检测穿越）

    返回:
        [{action: BUY|SELL, level, price, shares, reason}]
    """
    if not kline_data or not grid_params:
        return []

    latest = kline_data[-1]
    current_price = latest["c"]
    grid_lines = grid_params["grid_lines"]
    per_grid = grid_params["per_grid_shares"]

    triggers = []
    current_level = None
    for gl in grid_lines:
        if gl["price"] <= current_price:
            current_level = gl["level"]

    # 简单版：根据当前价所在层与持仓层比较
    if positions and "filled_levels" in positions:
        filled = positions["filled_levels"]

        # 卖出：价格上升到已买入层之上
        for gl in grid_lines:
            if gl["level"] in filled and gl["level"] < current_level:
                if gl["price"] > 0 and current_price > gl["price"]:
                    triggers.append({
                        "action": "SELL",
                        "level": gl["level"],
                        "price": current_price,
                        "shares": per_grid,
                        "reason": f"价格突破网格线 #{gl['level']} ({gl['price']})"
                    })
                    filled.discard(gl["level"])

        # 买入：价格下降到未买入层之下
        for gl in grid_lines:
            if gl["level"] not in filled and gl["level"] <= current_level:
                triggers.append({
                    "action": "BUY",
                    "level": gl["level"],
                    "price": current_price,
                    "shares": per_grid,
                    "reason": f"价格触及网格线 #{gl['level']} ({gl['price']})"
                })
                filled.add(gl["level"])

    return triggers