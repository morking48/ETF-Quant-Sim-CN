#!/usr/bin/env python3
"""
ETF三因子 Web 后端 API 服务
封装原有的 etf_v7_threefactor.py 核心逻辑，提供 REST API
"""
import json
import urllib.request
import ssl
import os
import sys
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

# 将 etf-three-factor-v7/scripts 加入 sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TF_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', '..', 'etf-three-factor-v7', 'scripts'))
if TF_DIR not in sys.path:
    sys.path.insert(0, TF_DIR)

app = Flask(__name__)
CORS(app)

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

# ETF 配置
ETFS = {
    "510300": {"n": "华泰柏瑞沪深300ETF", "idx": "沪深300"},
    "510310": {"n": "易方达沪深300ETF",   "idx": "沪深300"},
    "510330": {"n": "华夏沪深300ETF",     "idx": "沪深300"},
    "159919": {"n": "嘉实沪深300ETF",     "idx": "沪深300"},
    "510050": {"n": "华夏上证50ETF",      "idx": "上证50"},
    "510500": {"n": "华泰柏瑞中证500ETF",  "idx": "中证500"},
    "512100": {"n": "南方中证1000ETF",    "idx": "中证1000"},
}


# ============================================================
# 数据获取（从原脚本移植）
# ============================================================

def fetch_kline(code, limit=60):
    """获取K线数据 - 腾讯财经API"""
    if code.startswith("sh") or code.startswith("sz"):
        pfx = code[:2]
        numcode = code[2:]
    else:
        pfx = "sh" if code.startswith(("51", "56", "0")) else "sz"
        numcode = code
    
    u = f"http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={pfx}{numcode},day,,,{limit},qfq"
    try:
        r = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(r, timeout=15, context=ssl_ctx) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        k = d.get("data", {}).get(f"{pfx}{numcode}", {}).get("day", []) or \
            d.get("data", {}).get(f"{pfx}{numcode}", {}).get("qfqday", [])
        return [{"date": r[0], "o": float(r[1]), "c": float(r[2]),
                 "h": float(r[3]), "l": float(r[4]), "v": float(r[5])}
                for r in k if len(r) >= 6 and r[0]]
    except Exception as e:
        return []


# ============================================================
# 三因子计算引擎
# ============================================================

def vprob(r):
    """量能概率"""
    if r < 0.5: return max(0, r / 0.5 * 5)
    if r < 1.0: return 5 + (r - 0.5) / 0.5 * 12
    if r < 1.3: return 17 + (r - 1) / 0.3 * 18
    if r < 1.5: return 35 + (r - 1.3) / 0.2 * 20
    if r < 2.0: return 55 + (r - 1.5) / 0.5 * 25
    if r < 3.0: return 80 + (r - 2) / 1 * 15
    if r < 5.0: return 95 + (r - 3) / 2 * 3
    return min(100, 98 + (r - 5) / 5 * 2)


def dprob(chg, t5_etf, t5_idx, vr, idx_chg):
    """方向概率"""
    rally_discount = 1.0
    if idx_chg > 2.0: rally_discount = 0.60
    elif idx_chg > 1.5: rally_discount = 0.70
    elif idx_chg > 1.0: rally_discount = 0.80
    elif idx_chg > 0.5: rally_discount = 0.90

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

    gap = t5_etf - t5_idx
    if gap > 3:      f2 = 95
    elif gap > 2:    f2 = 85
    elif gap > 1.2:  f2 = 75
    elif gap > 0.6:  f2 = 60
    elif gap > 0.2:  f2 = 50
    elif gap > -0.2: f2 = 40
    elif gap > -0.6: f2 = 30
    else:            f2 = 15

    if t5_idx < -4:     f3 = 95
    elif t5_idx < -3:   f3 = 90
    elif t5_idx < -2:   f3 = 80
    elif t5_idx < -1:   f3 = 70
    elif t5_idx < -0.5: f3 = 55
    elif t5_idx < 0:    f3 = 45
    elif t5_idx < 1:    f3 = 35
    elif t5_idx < 3:    f3 = 20
    else:               f3 = 10
    
    f4 = 35
    raw = f1 * 0.4 + f2 * 0.3 + f3 * 0.2 + f4 * 0.1
    return round(raw * rally_discount, 1)


def sprob(share_delta_pct):
    """份额概率 (权重30%) — 与原v7脚本完全一致"""
    if share_delta_pct is None:
        return None
    ap = abs(share_delta_pct)
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


_SSE_CACHE = {}
_SZSE_CACHE = {}


def _get_shares_sse(date_str):
    """上交所ETF份额 (akshare, 带缓存)"""
    if date_str in _SSE_CACHE:
        return _SSE_CACHE[date_str]
    try:
        import akshare as ak
        df = ak.fund_etf_scale_sse(date=date_str)
        if df is not None and len(df) > 0 and '基金代码' in df.columns:
            _SSE_CACHE[date_str] = df
            return df
    except:
        pass
    _SSE_CACHE[date_str] = None
    return None


def _get_shares_szse_range(start_date, end_date):
    """深交所ETF份额 (akshare, 带缓存)"""
    cache_key = f"{start_date}_{end_date}"
    if cache_key in _SZSE_CACHE:
        return _SZSE_CACHE[cache_key]
    result = {}
    try:
        import akshare as ak
        df = ak.fund_scale_daily_szse(start_date=start_date, end_date=end_date, symbol='ETF')
        if df is not None and len(df) > 0:
            for _, row in df.iterrows():
                code = str(row['基金代码'])
                d = str(row['日期'])[:10].replace('-', '')
                shares = float(row['基金份额'])
                if d not in result:
                    result[d] = {}
                result[d][code] = shares / 1e8
    except:
        pass
    _SZSE_CACHE[cache_key] = result
    return result


def fetch_share_history(codes, target_date, lookback=30):
    """
    获取所有ETF的份额历史数据
    返回: {code: {date: {shares_yi, delta_pct}}}
    """
    history = {}
    try:
        import akshare
    except ImportError:
        return history

    # 计算日期范围
    from datetime import datetime, timedelta
    end_dt = datetime.strptime(target_date, '%Y-%m-%d')
    start_dt = end_dt - timedelta(days=lookback)
    start_str = start_dt.strftime('%Y%m%d')
    end_str = end_dt.strftime('%Y%m%d')

    # 上交所ETF
    sse_codes = [c for c in codes if c.startswith(('51', '56'))]
    szse_codes = [c for c in codes if c.startswith(('15', '16'))]

    # 逐日查上交所
    current = end_dt
    while current >= start_dt:
        ds = current.strftime('%Y%m%d')
        df = _get_shares_sse(ds)
        if df is not None:
            for _, row in df.iterrows():
                code = str(row['基金代码'])
                if code in sse_codes:
                    d = current.strftime('%Y-%m-%d')
                    if code not in history:
                        history[code] = {}
                    try:
                        shares = float(row['基金份额'])
                    except:
                        continue
                    history[code][d] = {'shares_yi': round(shares, 2), 'date': d}
        current -= timedelta(days=1)

    # 深交所批量查
    if szse_codes:
        szse_map = _get_shares_szse_range(start_str, end_str)
        for d_str, code_map in szse_map.items():
            d = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:8]}"
            for code, shares_yi in code_map.items():
                if code in szse_codes:
                    if code not in history:
                        history[code] = {}
                    history[code][d] = {'shares_yi': round(shares_yi, 2), 'date': d}

    # 计算日份额变化百分比
    for code, dates in history.items():
        sorted_dates = sorted(dates.keys())
        for i, d in enumerate(sorted_dates):
            if i > 0:
                prev = dates[sorted_dates[i - 1]]['shares_yi']
                curr = dates[d]['shares_yi']
                if prev > 0:
                    delta = curr - prev
                    dates[d]['delta_yi'] = round(delta, 2)
                    dates[d]['delta_pct'] = round(delta / prev * 100, 2)

    return history


def align_idx(data, idx_d):
    idx_map = {}
    for j, d in enumerate(idx_d):
        idx_map[d["date"]] = j
    return [idx_map.get(d["date"]) for d in data]


def analyze_single(code, data, idx_d, days=35, share_data=None):
    """分析单只ETF的三因子数据（支持份额因子）"""
    if len(data) < 22:
        return []
    
    res = []
    aligned = align_idx(data, idx_d)
    three_factor_mode = False  # 是否成功启用了三因子
    
    for i in range(max(21, len(data) - days), len(data)):
        d = data[i]
        v = d["v"] / 10000  # 转为万手
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
            idchg = 0
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
        
        # 份额因子
        sp = None
        sd = None
        if share_data and code in share_data and d["date"] in share_data[code]:
            info = share_data[code][d["date"]]
            sd = info.get('delta_pct')
            sp = sprob(sd)
        
        # 三因子综合概率（有份额数据时） vs 二因子回退
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


# ============================================================
# API 路由
# ============================================================

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


@app.route('/api/etfs', methods=['GET'])
def get_etf_list():
    """获取监控ETF列表"""
    return jsonify([{
        "code": code,
        "name": info["n"],
        "index": info["idx"]
    } for code, info in ETFS.items()])


@app.route('/api/kline/<code>', methods=['GET'])
def get_kline(code):
    """获取单只ETF的K线数据"""
    limit = request.args.get('limit', 60, type=int)
    data = fetch_kline(code, limit)
    return jsonify({
        "code": code,
        "count": len(data),
        "data": data
    })


@app.route('/api/index_kline', methods=['GET'])
def get_index_kline():
    """获取沪深300指数的K线数据"""
    limit = request.args.get('limit', 60, type=int)
    data = fetch_kline("sh000300", limit)
    return jsonify({
        "code": "000300",
        "name": "沪深300",
        "count": len(data),
        "data": data
    })


@app.route('/api/analysis', methods=['GET'])
def get_analysis():
    """
    三因子完整分析（含份额因子）
    返回所有7只ETF的三因子数据
    """
    # 1. 获取沪深300指数
    idx_data = fetch_kline("sh000300", 60)
    
    # 1.5 先获取第一个ETF的K线确定target_date，再获取份额
    first_kline = fetch_kline(list(ETFS.keys())[0], 60)
    target_date = first_kline[-1]["date"] if first_kline else datetime.now().strftime('%Y-%m-%d')
    share_data = fetch_share_history(list(ETFS.keys()), target_date, 30)
    share_available = len(share_data) > 0
    
    # 2. 分析每只ETF
    results = []
    any_three_factor = False
    for code, info in ETFS.items():
        kline = fetch_kline(code, 60)
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
        
        hist, tf = analyze_single(code, kline, idx_data, 35, share_data)
        if tf: any_three_factor = True
        latest = hist[-1] if hist else None
        
        results.append({
            "code": code,
            "name": info["n"],
            "index": info["idx"],
            "history": hist,
            "latest": latest
        })
    
    # 3. 计算汇总
    high_count = sum(1 for r in results if r["latest"] and r["latest"]["cp"] >= 70)
    mid_count = sum(1 for r in results if r["latest"] and 50 <= r["latest"]["cp"] < 70)
    normal_count = sum(1 for r in results if r["latest"] and r["latest"]["cp"] < 50)
    error_count = sum(1 for r in results if r["latest"] is None)
    
    hs300_codes = ["510300", "510310", "510330", "159919"]
    hs300_high = sum(1 for r in results if r["code"] in hs300_codes and r["latest"] and r["latest"]["cp"] >= 50)
    
    return jsonify({
        "time": datetime.now().isoformat(),
        "target_date": target_date,
        "mode": "three_factor" if any_three_factor else "two_factor",
        "share_available": share_available,
        "summary": {
            "high": high_count,
            "mid": mid_count,
            "normal": normal_count,
            "error": error_count,
            "hs300_alert": hs300_high
        },
        "etfs": results
    })


@app.route('/api/analysis/<code>', methods=['GET'])
def get_single_analysis(code):
    """获取单只ETF的三因子分析（含份额因子）"""
    if code not in ETFS:
        return jsonify({"error": f"未知ETF代码: {code}"}), 404
    
    idx_data = fetch_kline("sh000300", 60)
    kline = fetch_kline(code, 60)
    
    if len(kline) < 22:
        return jsonify({"error": f"数据不足({len(kline)}条)"}), 500
    
    target_date = kline[-1]["date"] if kline else datetime.now().strftime('%Y-%m-%d')
    share_data = fetch_share_history([code], target_date, 30)
    
    hist, three_factor = analyze_single(code, kline, idx_data, 35, share_data)
    
    return jsonify({
        "code": code,
        "name": ETFS[code]["n"],
        "index": ETFS[code]["idx"],
        "mode": "three_factor" if three_factor else "two_factor",
        "share_available": len(share_data) > 0,
        "history": hist,
        "latest": hist[-1] if hist else None
    })


if __name__ == '__main__':
    print("=" * 60)
    print("🛡️ ETF三因子 Web 后端服务")
    print("=" * 60)
    print(f"API地址: http://localhost:5000")
    print(f"健康检查: http://localhost:5000/api/health")
    print(f"ETF列表:  http://localhost:5000/api/etfs")
    print(f"完整分析: http://localhost:5000/api/analysis")
    print(f"单ETF:    http://localhost:5000/api/analysis/510300")
    print(f"K线数据:  http://localhost:5000/api/kline/510300")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)