"""
三因子分析引擎（从 server.py 抽出 analyze_single + align_idx）
"""
from .factors import vprob, dprob, sprob, calc_composite, get_signal_level


def align_idx(data, idx_d):
    """将ETF日期的K线索引对齐到沪深300"""
    idx_map = {}
    for j, d in enumerate(idx_d):
        idx_map[d["date"]] = j
    return [idx_map.get(d["date"]) for d in data]


def analyze_single(code, data, idx_d, days=35, share_data=None):
    """
    分析单只ETF的三因子数据

    返回: (results_list, three_factor_mode: bool)
      results_list 中每项包含:
        d, c, chg, t5, t5i, idx_chg, v, vma, vr,
        vp, dp, sp, sd, cp, signal
    """
    if len(data) < 22:
        return [], False

    res = []
    aligned = align_idx(data, idx_d)
    three_factor_mode = False

    for i in range(max(21, len(data) - days), len(data)):
        d = data[i]
        v = d["v"] / 10000
        pv = [data[j]["v"] / 10000 for j in range(i - 20, i)]
        ma = sum(pv) / 20
        if ma == 0:
            continue

        vr = v / ma
        pc = data[i - 1]["c"]
        chg = (d["c"] - pc) / pc * 100 if pc > 0 else 0

        t5 = 0
        if i >= 6 and data[i - 5]["c"] > 0:
            t5 = (d["c"] - data[i - 5]["c"]) / data[i - 5]["c"] * 100

        t5i = 0
        idchg = 0
        if i < len(aligned) and aligned[i] is not None:
            ii = aligned[i]
            if ii > 0 and idx_d[ii - 1]["c"] > 0:
                idchg = round((idx_d[ii]["c"] - idx_d[ii - 1]["c"]) / idx_d[ii - 1]["c"] * 100, 2)
            t5i_val = 0
            if i >= 6 and aligned[i - 5] is not None:
                j5 = aligned[i - 5]
                if idx_d[j5]["c"] > 0:
                    t5i_val = (idx_d[ii]["c"] - idx_d[j5]["c"]) / idx_d[j5]["c"] * 100
            t5i = round(t5i_val, 2)

        vp = round(vprob(vr), 1)
        dp = dprob(chg, t5, t5i, vr, idchg)

        # 份额因子 (可用时三因子，不可用时二因子回退)
        sp = None
        sd = None
        if share_data and code in share_data and d["date"] in share_data[code]:
            info = share_data[code][d["date"]]
            sd = info.get('delta_pct')
            sp = sprob(sd)

        if sp is not None:
            cp = round(vp * 0.5 + dp * 0.2 + sp * 0.3, 1)
            three_factor_mode = True
        else:
            cp = round(vp * 0.7 + dp * 0.3, 1)

        row = {
            "d": d["date"],
            "c": d["c"],
            "chg": round(chg, 2),
            "t5": round(t5, 2),
            "t5i": t5i,
            "idx_chg": idchg,
            "v": round(v, 2),
            "vma": round(ma, 2),
            "vr": round(vr, 2),
            "vp": vp,
            "dp": dp,
            "sp": round(sp, 1) if sp is not None else None,
            "sd": sd,
            "cp": cp,
            "signal": "HIGH" if cp >= 70 else ("MID" if cp >= 50 else "NORMAL"),
        }
        res.append(row)

    return res, three_factor_mode


def analyze_etfs(codes, etf_config, idx_data, share_data, days=35, fetch_kline_fn=None):
    """
    批量分析多只ETF → 返回 (results, any_three_factor, target_date)

    参数:
        codes: ETF代码列表
        etf_config: {code: {n, idx}} 的配置字典
        idx_data: 沪深300 K线列表
        share_data: 份额数据 {code: {date: {shares_yi, delta_pct}}}
        days: 分析回溯天数
        fetch_kline_fn: function(code, limit) -> kline列表
    """
    results = []
    any_three_factor = False
    target_date = None

    for code in sorted(codes):
        info = etf_config.get(code, {"n": code, "idx": ""})

        if fetch_kline_fn:
            kline = fetch_kline_fn(code, 60)
        else:
            kline = []

        if len(kline) < 22:
            results.append({
                "code": code,
                "name": info["n"],
                "index": info["idx"],
                "error": f"数据不足({len(kline)}条)",
                "history": [],
                "latest": None
            })
            continue

        if target_date is None and kline:
            target_date = kline[-1]["date"]

        hist, tf = analyze_single(code, kline, idx_data, days, share_data)
        if tf:
            any_three_factor = True
        latest = hist[-1] if hist else None

        results.append({
            "code": code,
            "name": info["n"],
            "index": info["idx"],
            "history": hist,
            "latest": latest
        })

    return results, any_three_factor, target_date