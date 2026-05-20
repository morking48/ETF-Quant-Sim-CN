"""
三因子计算函数（从 server.py 抽出，逻辑不变）
"""

# ============================================================
# 量能概率 vprob
# ============================================================

def vprob(r):
    """量能概率 — 成交倍量分段线性映射"""
    if r < 0.5: return max(0, r / 0.5 * 5)
    if r < 1.0: return 5 + (r - 0.5) / 0.5 * 12
    if r < 1.3: return 17 + (r - 1) / 0.3 * 18
    if r < 1.5: return 35 + (r - 1.3) / 0.2 * 20
    if r < 2.0: return 55 + (r - 1.5) / 0.5 * 25
    if r < 3.0: return 80 + (r - 2) / 1 * 15
    if r < 5.0: return 95 + (r - 3) / 2 * 3
    return min(100, 98 + (r - 5) / 5 * 2)


# ============================================================
# 方向概率 dprob
# ============================================================

def dprob(chg, t5_etf, t5_idx, vr, idx_chg):
    """方向概率 — 4维度加权（护盘特征检测）"""
    # 普涨折扣
    rally_discount = 1.0
    if idx_chg > 2.0: rally_discount = 0.60
    elif idx_chg > 1.5: rally_discount = 0.70
    elif idx_chg > 1.0: rally_discount = 0.80
    elif idx_chg > 0.5: rally_discount = 0.90

    # 维度1: 当日行情特征 (40%)
    if chg > 0.3 and t5_idx < -1:      f1 = 95
    elif chg > 0 and t5_idx < -0.5:     f1 = 85
    elif chg > 0 and t5_idx < 0:        f1 = 70
    elif abs(chg) < 0.15 and t5_idx < -1: f1 = 80
    elif abs(chg) < 0.3 and t5_idx < -0.5: f1 = 65
    elif chg > 1 and vr > 1.5 and idx_chg > 1: f1 = 25
    elif chg > 1 and vr > 1.5:          f1 = 45
    elif chg > 0.5 and vr > 1.3 and idx_chg > 1: f1 = 35
    elif chg > 0.5 and vr > 1.3:        f1 = 50
    elif chg > 0:                       f1 = 40
    elif chg < -1.5 and vr > 2:         f1 = 8
    elif chg < -0.5 and vr > 1.5:       f1 = 15
    else:                               f1 = 25

    # 维度2: 超额表现 (30%)
    gap = t5_etf - t5_idx
    if gap > 3:      f2 = 95
    elif gap > 2:    f2 = 85
    elif gap > 1.2:  f2 = 75
    elif gap > 0.6:  f2 = 60
    elif gap > 0.2:  f2 = 50
    elif gap > -0.2: f2 = 40
    elif gap > -0.6: f2 = 30
    else:            f2 = 15

    # 维度3: 前期大盘走势 (20%)
    if t5_idx < -4:     f3 = 95
    elif t5_idx < -3:   f3 = 90
    elif t5_idx < -2:   f3 = 80
    elif t5_idx < -1:   f3 = 70
    elif t5_idx < -0.5: f3 = 55
    elif t5_idx < 0:    f3 = 45
    elif t5_idx < 1:    f3 = 35
    elif t5_idx < 3:    f3 = 20
    else:               f3 = 10

    # 维度4: 尾盘行为 (10%) — 固定35%
    f4 = 35

    raw = f1 * 0.4 + f2 * 0.3 + f3 * 0.2 + f4 * 0.1
    return round(raw * rally_discount, 1)


# ============================================================
# 份额概率 sprob
# ============================================================

def sprob(share_delta_pct):
    """份额概率 (权重30%) — ETF份额日变化映射"""
    if share_delta_pct is None:
        return None
    if share_delta_pct > 10:
        return 95
    elif share_delta_pct > 5:
        return 80 + (share_delta_pct - 5) / 5 * 15
    elif share_delta_pct > 3:
        return 65 + (share_delta_pct - 3) / 2 * 15
    elif share_delta_pct > 1:
        return 45 + (share_delta_pct - 1) / 2 * 20
    elif share_delta_pct > 0:
        return 30 + share_delta_pct / 1 * 15
    elif share_delta_pct > -1:
        return 15 + (share_delta_pct + 1) / 1 * 15
    elif share_delta_pct > -5:
        return 5 + (share_delta_pct + 5) / 4 * 10
    else:
        return max(0, 5 + (share_delta_pct + 5) / 5 * 5)


# ============================================================
# 综合概率 + 信号分级
# ============================================================

def calc_composite(vp, dp, sp=None):
    """
    综合概率
    sp可用 → 三因子: vp×50% + dp×20% + sp×30%
    sp=None → 二因子降级: vp×70% + dp×30%
    """
    if sp is not None:
        return round(vp * 0.5 + dp * 0.2 + sp * 0.3, 1)
    return round(vp * 0.7 + dp * 0.3, 1)


def get_signal_level(cp):
    """信号分级"""
    if cp >= 70:
        return "HIGH"
    elif cp >= 50:
        return "MID"
    return "NORMAL"