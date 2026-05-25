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
import time
import threading
import uuid
import math
from datetime import datetime, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS

# 策略系统导入（自动发现 + 注册）
import strategies

# 将 etf-three-factor-v7/scripts 加入 sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TF_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, '..', '..', 'etf-three-factor-v7', 'scripts'))
if TF_DIR not in sys.path:
    sys.path.insert(0, TF_DIR)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
PWA_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'etf-app'))
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
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
# 回测异步任务管理
# ============================================================
_BACKTEST_JOBS = {}
_BACKTEST_LOCK = threading.Lock()


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
    """份额概率 (权重30%)"""
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
# 份额数据获取（akshare + JSON文件缓存）
# ============================================================

_SHARE_CACHE = {}
_SHARE_LOCK = threading.Lock()
_SHARE_JSON_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_share_cache.json')


def _load_share_cache_from_disk():
    """从JSON文件恢复份额缓存"""
    global _SHARE_CACHE
    try:
        if os.path.exists(_SHARE_JSON_FILE):
            with open(_SHARE_JSON_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            with _SHARE_LOCK:
                _SHARE_CACHE = data
            print(f"[缓存] 从磁盘恢复 {len(_SHARE_CACHE)} 天份额缓存")
    except Exception as e:
        print(f"[缓存] 磁盘恢复失败: {e}")


def _save_share_cache_to_disk():
    """将份额缓存写入JSON文件"""
    try:
        with _SHARE_LOCK:
            data = dict(_SHARE_CACHE)
        with open(_SHARE_JSON_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        print(f"[缓存] 磁盘保存失败: {e}")


# 启动时加载缓存
_load_share_cache_from_disk()

# 内存缓存 (临时, 每次启动重建)
_SSE_CACHE = {}
_SZSE_CACHE = {}


def _get_shares_sse(date_str):
    """上交所ETF份额 (akshare fund_etf_scale_sse, 带内存缓存)"""
    if date_str in _SSE_CACHE:
        return _SSE_CACHE[date_str]
    try:
        import akshare as ak
        df = ak.fund_etf_scale_sse(date=date_str)
        if df is not None and len(df) > 0 and '基金代码' in df.columns:
            _SSE_CACHE[date_str] = df
            return df
    except Exception as e:
        pass
    _SSE_CACHE[date_str] = None
    return None


def _get_shares_szse_range(start_date, end_date):
    """深交所ETF份额 (akshare fund_scale_daily_szse, 带内存缓存)"""
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
    except Exception as e:
        pass
    _SZSE_CACHE[cache_key] = result
    return result


def fetch_share_history(codes, target_date, lookback=5):
    """获取所有ETF的份额历史数据 (默认5天, ~18s)
    返回: {code: {date: {shares_yi, delta_pct}}}"""
    history = {}
    try:
        import akshare
    except ImportError:
        return history

    end_dt = datetime.strptime(target_date, '%Y-%m-%d')
    start_dt = end_dt - timedelta(days=lookback)
    start_str = start_dt.strftime('%Y%m%d')
    end_str = end_dt.strftime('%Y%m%d')

    sse_codes = [c for c in codes if c.startswith(('51', '56'))]
    szse_codes = [c for c in codes if c.startswith(('15', '16'))]

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

    if szse_codes:
        szse_map = _get_shares_szse_range(start_str, end_str)
        for d_str, code_map in szse_map.items():
            d = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:8]}"
            for code, shares_yi in code_map.items():
                if code in szse_codes:
                    if code not in history:
                        history[code] = {}
                    history[code][d] = {'shares_yi': round(shares_yi, 2), 'date': d}

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


def get_share_data_with_cache(codes, target_date):
    """获取份额数据（磁盘缓存 + 懒加载）"""
    global _SHARE_CACHE
    
    with _SHARE_LOCK:
        if target_date in _SHARE_CACHE:
            return _SHARE_CACHE[target_date]
    
    try:
        print(f"[份额] 开始加载 {target_date} 的份额数据 (5天回溯)...")
        t0 = time.time()
        result = fetch_share_history(codes, target_date, lookback=5)
        elapsed = time.time() - t0
        
        with _SHARE_LOCK:
            _SHARE_CACHE[target_date] = result
        
        t = threading.Thread(target=_save_share_cache_to_disk, daemon=True)
        t.start()
        
        share_count = len(result)
        print(f"[份额] 完成 {target_date} ({elapsed:.1f}s), {share_count}只ETF")
        return result
        
    except Exception as e:
        print(f"[份额] 失败 {target_date}: {type(e).__name__}: {e}")
        return {}


def align_idx(data, idx_d):
    idx_map = {}
    for j, d in enumerate(idx_d):
        idx_map[d["date"]] = j
    return [idx_map.get(d["date"]) for d in data]


def analyze_single(code, data, idx_d, days=35, share_data=None):
    """分析单只ETF的三因子数据（份额不可用时自动二因子回退）"""
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
            "d": d["date"], "c": d["c"], "chg": round(chg, 2),
            "t5": round(t5, 2), "t5i": t5i, "idx_chg": idchg,
            "v": round(v, 2), "vma": round(ma, 2), "vr": round(vr, 2),
            "vp": vp, "dp": dp,
            "sp": round(sp, 1) if sp is not None else None,
            "sd": sd, "cp": cp,
            "signal": "HIGH" if cp >= 70 else ("MID" if cp >= 50 else "NORMAL"),
        }
        res.append(row)
    
    return res, three_factor_mode


# ============================================================
# 核心: 回测模拟引擎 (纯计算，不涉及后端)
# ============================================================
def _run_backtest_sim(all_hist, idx_data, sorted_dates, all_sorted_dates, initial_capital, position_ratio, buy_threshold, fee_rate):
    """核心回测模拟逻辑，返回dict结果"""
    max_positions = 4
    max_single_pct = 0.50

    idx_price_map = {}
    for row in idx_data:
        idx_price_map[row["date"]] = row["c"]
    idx_start_price = None
    for d in sorted_dates:
        if d in idx_price_map:
            idx_start_price = idx_price_map[d]
            break

    # 按日期组织数据
    date_map = {}
    for code, hist in all_hist.items():
        for h in hist:
            d = h["d"]
            if d not in date_map:
                date_map[d] = {}
            date_map[d][code] = h

    cash = initial_capital
    positions = {}
    trades = []
    equity_curve = []

    for d in sorted_dates:
        day_data = date_map.get(d, {})

        total_mv = 0
        for code, pos in list(positions.items()):
            if code in day_data:
                pos["current_price"] = day_data[code]["c"]
                pos["market_value"] = pos["shares"] * pos["current_price"]
                total_mv += pos["market_value"]
                pos["hold_days"] = pos.get("hold_days", 0) + 1

        for code, pos in list(positions.items()):
            if code not in day_data:
                continue
            h = day_data[code]
            sell_reason = None
            pnl_pct = (pos["current_price"] - pos["cost_price"]) / pos["cost_price"] * 100 if pos["cost_price"] > 0 else 0

            if pnl_pct <= -5:
                sell_reason = f"硬止损: 亏损{pnl_pct:.1f}%"
            elif h["cp"] < 40:
                sell_reason = f"信号消退: CP={h['cp']:.0f}%"
            elif pos.get("hold_days", 0) >= 10 and pnl_pct <= 0:
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
                    "name": pos.get("name", ETFS.get(code, {}).get("n", code)),
                    "price": round(pos["current_price"], 3), "shares": int(shares),
                    "amount": round(actual_income, 2), "fee": round(fee, 2),
                    "pnl": round(pnl, 2), "reason": sell_reason,
                    "hold_days": pos.get("hold_days", 0)
                })
                del positions[code]

        total_value = cash + sum(p.get("market_value", 0) for p in positions.values())
        used_ratio = (total_value - cash) / total_value if total_value > 0 else 0

        if used_ratio < 0.80 and len(positions) < max_positions:
            eligible = []
            for code, h in day_data.items():
                if code in positions:
                    continue
                if h["cp"] >= buy_threshold:
                    single_buy_value = total_value * position_ratio
                    if single_buy_value / total_value <= max_single_pct:
                        eligible.append((code, h))

            if eligible:
                code, h = max(eligible, key=lambda x: x[1]["cp"])
                max_buy = min(total_value * position_ratio, cash * 0.95, total_value * max_single_pct)
                fee = max(5, max_buy * fee_rate)
                shares = math.floor((max_buy - fee) / h["c"] / 100) * 100
                if shares >= 100:
                    cost = shares * h["c"] + fee
                    cash -= cost
                    positions[code] = {
                        "shares": shares, "cost_price": h["c"],
                        "current_price": h["c"], "market_value": shares * h["c"],
                        "hold_days": 0, "name": ETFS.get(code, {}).get("n", code)
                    }
                    trades.append({
                        "date": d, "action": "BUY", "code": code,
                        "name": ETFS.get(code, {}).get("n", code),
                        "price": round(h["c"], 3), "shares": int(shares),
                        "amount": round(cost, 2), "fee": round(fee, 2),
                        "reason": f"三因子高确信: CP={h['cp']:.0f}%"
                    })

        day_total = cash + sum(p.get("market_value", 0) for p in positions.values())
        benchmark_val = initial_capital
        if idx_start_price and d in idx_price_map:
            benchmark_val = initial_capital * (idx_price_map[d] / idx_start_price)
        pos_detail = []
        for code, pos in positions.items():
            pos_detail.append({
                "code": code, "name": pos.get("name", ""),
                "shares": pos["shares"], "price": round(pos.get("current_price", 0), 3),
                "market_value": round(pos.get("market_value", 0), 2),
                "weight_pct": round(pos.get("market_value", 0) / day_total * 100, 1) if day_total > 0 else 0,
                "pnl_pct": round((pos.get("current_price", 0) - pos["cost_price"]) / pos["cost_price"] * 100, 1) if pos["cost_price"] > 0 else 0,
                "hold_days": pos.get("hold_days", 0)
            })
        equity_curve.append({
            "date": d, "total_value": round(day_total, 2),
            "benchmark_value": round(benchmark_val, 2),
            "cash": round(cash, 2), "positions": pos_detail
        })

    final_mv = sum(p.get("market_value", 0) for p in positions.values())
    final_value = cash + final_mv
    total_return = round((final_value - initial_capital) / initial_capital * 100, 2)

    sell_trades = [t for t in trades if t["action"] == "SELL"]
    buy_trades = [t for t in trades if t["action"] == "BUY"]
    win_trades = [t for t in sell_trades if t.get("pnl", 0) > 0]
    win_rate = round(len(win_trades) / len(sell_trades) * 100, 1) if sell_trades else 0

    eq_vals = [e["total_value"] for e in equity_curve]
    if not eq_vals:
        eq_vals = [initial_capital]
    peak = eq_vals[0]
    max_dd = 0
    for v in eq_vals:
        if v > peak: peak = v
        dd = (peak - v) / peak * 100 if peak > 0 else 0
        if dd > max_dd: max_dd = dd
    max_dd = round(max_dd, 2)

    daily_returns = []
    for i in range(1, len(eq_vals)):
        if eq_vals[i - 1] > 0:
            daily_returns.append((eq_vals[i] - eq_vals[i - 1]) / eq_vals[i - 1])
    if daily_returns:
        avg_ret = sum(daily_returns) / len(daily_returns)
        std_ret = (sum((r - avg_ret) ** 2 for r in daily_returns) / len(daily_returns)) ** 0.5
        sharpe = round(avg_ret / std_ret * (252 ** 0.5), 2) if std_ret > 0 else 0
    else:
        sharpe = 0

    benchmark_return = 0
    if idx_start_price and equity_curve:
        bench_final = equity_curve[-1]["benchmark_value"]
        benchmark_return = round((bench_final - initial_capital) / initial_capital * 100, 2)

    return {
        "start_date": sorted_dates[0] if sorted_dates else "",
        "end_date": sorted_dates[-1] if sorted_dates else "",
        "data_start_date": all_sorted_dates[0] if all_sorted_dates else "",
        "data_end_date": all_sorted_dates[-1] if all_sorted_dates else "",
        "initial_capital": initial_capital,
        "final_value": round(final_value, 2),
        "total_return": total_return,
        "benchmark_return": benchmark_return,
        "total_trades": len(trades),
        "buy_count": len(buy_trades),
        "sell_count": len(sell_trades),
        "win_count": len(win_trades),
        "win_rate": win_rate,
        "max_drawdown": str(max_dd),
        "sharpe": str(sharpe),
        "equity_curve": equity_curve,
        "trades": trades,
    }


# ============================================================
# API 路由
# ============================================================

@app.route('/favicon.ico')
def favicon():
    return '', 204


def _serve_file(directory, filename):
    from flask import send_from_directory
    return send_from_directory(directory, filename)


@app.route('/')
@app.route('/index.html')
def serve_index():
    return _serve_file(FRONTEND_DIR, 'index.html')


@app.route('/app/')
@app.route('/app/index.html')
def serve_app_index():
    return _serve_file(PWA_DIR, 'index.html')


@app.route('/app/<path:filename>')
def serve_app_static(filename):
    return _serve_file(PWA_DIR, filename)


@app.route('/api/strategies', methods=['GET'])
def list_strategies():
    from strategies import list_strategies as ls
    return jsonify(ls())


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


@app.route('/api/etfs', methods=['GET'])
def get_etf_list():
    return jsonify([{"code": code, "name": info["n"], "index": info["idx"]} for code, info in ETFS.items()])


@app.route('/api/kline/<code>', methods=['GET'])
def get_kline(code):
    limit = request.args.get('limit', 60, type=int)
    data = fetch_kline(code, limit)
    return jsonify({"code": code, "count": len(data), "data": data})


@app.route('/api/index_kline', methods=['GET'])
def get_index_kline():
    limit = request.args.get('limit', 60, type=int)
    data = fetch_kline("sh000300", limit)
    return jsonify({"code": "000300", "name": "沪深300", "count": len(data), "data": data})


@app.route('/api/analysis', methods=['GET'])
def get_analysis():
    codes = list(ETFS.keys())
    idx_data = fetch_kline("sh000300", 60)
    first_kline = fetch_kline(codes[0], 60)
    target_date = first_kline[-1]["date"] if first_kline else datetime.now().strftime('%Y-%m-%d')
    share_data = get_share_data_with_cache(codes, target_date)
    share_available = len(share_data) > 0

    results = []
    any_three_factor = False
    for code, info in ETFS.items():
        kline = fetch_kline(code, 60)
        if len(kline) < 22:
            results.append({"code": code, "name": info["n"], "index": info["idx"], "error": f"数据不足({len(kline)}条)", "history": [], "latest": None})
            continue
        hist, tf = analyze_single(code, kline, idx_data, 35, share_data)
        if tf: any_three_factor = True
        latest = hist[-1] if hist else None
        results.append({"code": code, "name": info["n"], "index": info["idx"], "history": hist, "latest": latest})

    high_count = sum(1 for r in results if r["latest"] and r["latest"]["cp"] >= 70)
    mid_count = sum(1 for r in results if r["latest"] and 50 <= r["latest"]["cp"] < 70)
    normal_count = sum(1 for r in results if r["latest"] and r["latest"]["cp"] < 50)
    error_count = sum(1 for r in results if r["latest"] is None)
    hs300_codes = ["510300", "510310", "510330", "159919"]
    hs300_high = sum(1 for r in results if r["code"] in hs300_codes and r["latest"] and r["latest"]["cp"] >= 50)

    volume_ranking = []
    for r in results:
        if r["latest"]:
            vr = r["latest"]["vr"]
            label = "极端放量" if vr >= 2.0 else ("显著放量" if vr >= 1.5 else ("温和放量" if vr >= 1.0 else "正常"))
            volume_ranking.append({"code": r["code"], "name": r["name"], "index": r["index"], "vr": vr, "v": r["latest"]["v"], "vma": r["latest"]["vma"], "chg": r["latest"]["chg"], "cp": r["latest"]["cp"], "label": label})
    volume_ranking.sort(key=lambda x: x["vr"], reverse=True)

    up_count = sum(1 for r in results if r["latest"] and r["latest"]["chg"] > 0)
    down_count = sum(1 for r in results if r["latest"] and r["latest"]["chg"] < 0)
    flat_count = sum(1 for r in results if r["latest"] and r["latest"]["chg"] == 0)
    if up_count >= len(results) * 0.75: direction_consensus = "强一致看多"
    elif down_count >= len(results) * 0.75: direction_consensus = "强一致看空"
    elif up_count > down_count: direction_consensus = "偏多"
    elif down_count > up_count: direction_consensus = "偏空"
    else: direction_consensus = "分歧"

    valid_cps = [r["latest"]["cp"] for r in results if r["latest"]]
    avg_cp = round(sum(valid_cps) / len(valid_cps), 1) if valid_cps else 0
    if avg_cp >= 70: rating = "🔴 高确信 — 国家队大概率正在积极增持宽基ETF"
    elif avg_cp >= 50: rating = "🟡 中等确信 — 值得关注，等待更多确认信号"
    elif avg_cp >= 30: rating = "🟠 低确信 — 异常放量但无法归因于国家队"
    else: rating = "⚪ 无信号 — 正常交易，未检测到国家队操作痕迹"

    date_sig = {}
    for r in results:
        for h in r.get("history", []):
            d = h["d"]
            if d not in date_sig: date_sig[d] = {"total": 0, "high": 0, "mid": 0, "codes": []}
            date_sig[d]["total"] += 1
            if h["cp"] >= 70: date_sig[d]["high"] += 1; date_sig[d]["codes"].append(f"{r['code']}({h['cp']:.0f}%)")
            elif h["cp"] >= 50: date_sig[d]["mid"] += 1
    signal_backtrack = []
    for d, v in date_sig.items():
        if v["high"] >= 2 or v["high"] + v["mid"] >= 4:
            signal_backtrack.append({"date": d, "high": v["high"], "mid": v["mid"], "codes": v["codes"][:5]})
    signal_backtrack.sort(key=lambda x: x["date"], reverse=True)

    return jsonify({
        "time": datetime.now().isoformat(), "target_date": target_date,
        "mode": "three_factor" if any_three_factor else "two_factor",
        "share_available": share_available,
        "share_status": "available" if share_available else "unavailable",
        "summary": {"high": high_count, "mid": mid_count, "normal": normal_count, "error": error_count, "hs300_alert": hs300_high},
        "report": {"rating": rating, "avg_cp": avg_cp, "volume_ranking": volume_ranking, "direction": {"up": up_count, "down": down_count, "flat": flat_count, "consensus": direction_consensus}, "signal_backtrack": signal_backtrack[:10]},
        "etfs": results
    })


@app.route('/api/strategy/<strategy_id>/analyze', methods=['GET'])
def strategy_analyze(strategy_id):
    strategy = strategies._registry.get(strategy_id)
    if not strategy:
        return jsonify({"error": f"未知策略: {strategy_id}"}), 404
    if strategy_id == "grid":
        from strategies.grid.analyze import analyze_grid
        from strategies.grid.config import DEFAULT_CONFIG as GRID_DEFAULT
        days = request.args.get('days', 250, type=int)
        results = []
        for code, info in ETFS.items():
            kline = fetch_kline(code, days)
            if len(kline) >= 20:
                result = analyze_grid(code, kline, GRID_DEFAULT)
                result["name"] = info["n"]
                results.append(result)
            else:
                results.append({"code": code, "name": info["n"], "error": "数据不足"})
        return jsonify({"strategy": strategy_id, "etfs": results})
    return jsonify({"error": f"策略 {strategy_id} 暂不支持分析视图"}), 400


@app.route('/api/strategy/<strategy_id>/backtest', methods=['POST'])
def strategy_backtest(strategy_id):
    from strategies import get_strategy as gs
    strategy = gs(strategy_id)
    if not strategy: return jsonify({"error": f"未知策略: {strategy_id}"}), 404
    data = request.get_json(silent=True) or {}
    config = {**strategy.DEFAULT_CONFIG, **data}
    if strategy_id == "grid":
        code = data.get("code", "510300")
        day_param = data.get("days", 250)
        kline_limit = max(60, min(day_param, 250))
        kline_data = fetch_kline(code, kline_limit)
        if len(kline_data) < 60: return jsonify({"error": f"K线数据不足({len(kline_data)}条，需≥60)"}), 500
        result = strategy.run_backtest(kline_data=kline_data, config=config)
        return jsonify(result)
    elif strategy_id == "three_factor":
        return backtest()
    return jsonify({"error": f"策略 {strategy_id} 的回测暂未实现"}), 501


# ============================================================
# 模拟盘数据云端同步
# ============================================================
_SIMDATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'userdata')

def _sim_file(strategy='three_factor'):
    return os.path.join(_SIMDATA_DIR, f'sim_data_{strategy}.json')


@app.route('/api/sim/save', methods=['POST'])
def sim_save():
    try:
        data = request.get_json(silent=True) or {}
        strategy = data.get('strategy', request.args.get('strategy', 'three_factor'))
        filepath = _sim_file(strategy)
        os.makedirs(_SIMDATA_DIR, exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"status": "ok", "message": f"已保存到 {filepath}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sim/load', methods=['GET'])
def sim_load():
    try:
        strategy = request.args.get('strategy', 'three_factor')
        filepath = _sim_file(strategy)
        if not os.path.exists(filepath): return jsonify({"data": None, "message": "暂无存档数据"})
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({"data": data, "message": "加载成功"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
# 回测端点 (支持三因子真份额数据后台加载)
# ============================================================

@app.route('/api/backtest', methods=['POST'])
def backtest():
    data = request.get_json(silent=True) or {}
    days = data.get('days', 30)
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    position_ratio = data.get('position_ratio', 0.30)
    buy_threshold = data.get('buy_threshold', 70)
    fee_rate = data.get('fee_rate', 0.00025)
    initial_capital = data.get('initial_capital', 100000)
    use_shares = data.get('use_shares', False)

    codes = list(ETFS.keys())
    max_kline_days = max(60, days + 30)
    if start_date and end_date:
        max_kline_days = 250

    # --- 三因子真份额数据模式 ---
    if use_shares:
        job_id = str(uuid.uuid4())
        with _BACKTEST_LOCK:
            _BACKTEST_JOBS[job_id] = {
                'status': 'loading_shares', 'progress': 0, 'total': 0,
                'message': '正在加载K线数据...', 'result': None, 'error': None,
            }

        def _run_bt(jid):
            try:
                job = _BACKTEST_JOBS.get(jid)
                if not job: return

                # Step 1: 拉K线确定日期范围
                idx_data = fetch_kline("sh000300", max_kline_days)
                all_hist_temp = {}
                for code in codes:
                    kline = fetch_kline(code, max_kline_days)
                    if len(kline) < 22: continue
                    lookback = min(len(kline) - 5, max_kline_days - 5)
                    hist, _ = analyze_single(code, kline, idx_data, lookback, {})
                    if hist: all_hist_temp[code] = hist

                all_dates = set()
                for hh in all_hist_temp.values():
                    for h in hh: all_dates.add(h['d'])
                sorted_all = sorted(all_dates)

                if start_date and end_date:
                    sorted_dates = [d for d in sorted_all if start_date <= d <= end_date]
                else:
                    sorted_dates = sorted_all[-days:]

                if not sorted_dates:
                    job['status'] = 'error'; job['error'] = '指定区间内无数据'; return

                # Step 2: 拉份额数据
                need_dates = set(sorted_dates)
                first_idx = sorted_all.index(sorted_dates[0])
                if first_idx > 0: need_dates.add(sorted_all[first_idx - 1])
                missing = sorted([d for d in need_dates])
                job['total'] = len(missing); job['progress'] = 0
                job['message'] = f'正在拉取 {len(missing)} 天的历史份额数据...'

                sse_codes = [c for c in codes if c.startswith(('51', '56'))]
                szse_codes = [c for c in codes if c.startswith(('15', '16'))]
                new_history = {}

                for idx, d in enumerate(missing):
                    job['progress'] = idx + 1
                    job['message'] = f'上交所份额 {idx+1}/{len(missing)}: {d}'
                    d8 = d.replace('-', '')
                    df = _get_shares_sse(d8)
                    if df is not None:
                        for code in sse_codes:
                            try:
                                import pandas as pd
                                row = df[df['基金代码'] == code]
                                if len(row) > 0:
                                    sy = round(float(row['基金份额'].values[0]) / 1e8, 2)
                                    if d not in new_history: new_history[d] = {}
                                    new_history[d][code] = {'shares_yi': sy, 'date': d}
                            except: pass

                if szse_codes and missing:
                    job['message'] = f'深交所份额 {missing[0]}~{missing[-1]}...'
                    min_d8 = missing[0].replace('-', '')
                    max_d8 = missing[-1].replace('-', '')
                    data_map = _get_shares_szse_range(min_d8, max_d8)
                    for d_str, cm in data_map.items():
                        d = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:8]}"
                        for code, sy in cm.items():
                            if code in szse_codes:
                                if d not in new_history: new_history[d] = {}
                                new_history[d][code] = {'shares_yi': round(sy, 2), 'date': d}

                # 计算delta
                job['message'] = '计算份额变化率...'
                for code in codes:
                    dates_with = sorted([dd for dd in new_history if code in new_history[dd]])
                    for i, dd in enumerate(dates_with):
                        if i > 0:
                            prev = new_history[dates_with[i - 1]][code]['shares_yi']
                            curr = new_history[dd][code]['shares_yi']
                            if prev > 0:
                                new_history[dd][code]['delta_yi'] = round(curr - prev, 2)
                                new_history[dd][code]['delta_pct'] = round((curr - prev) / prev * 100, 2)

                # 构建share_data_lookup: {code: {date: {delta_pct}}}
                share_lookup = {}
                for dd, cd in new_history.items():
                    for c in codes:
                        if c in cd:
                            if c not in share_lookup: share_lookup[c] = {}
                            share_lookup[c][dd] = cd[c]

                # 写入磁盘缓存
                with _SHARE_LOCK:
                    for dd, cd in new_history.items():
                        if dd not in _SHARE_CACHE: _SHARE_CACHE[dd] = {}
                        for c in codes:
                            if c in cd:
                                if c not in _SHARE_CACHE[dd]: _SHARE_CACHE[dd][c] = {}
                                _SHARE_CACHE[dd][c][dd] = cd[c]
                try: _save_share_cache_to_disk()
                except: pass

                # Step 3: 用真实份额重新分析
                job['status'] = 'computing'
                job['progress'] = 0; job['total'] = len(codes)
                job['message'] = '正在用三因子模型计算...'
                all_hist = {}
                for idx, code in enumerate(codes):
                    job['progress'] = idx + 1
                    job['message'] = f'三因子计算 {idx+1}/{len(codes)}: {code} {ETFS[code]["n"]}'
                    kline = fetch_kline(code, max_kline_days)
                    if len(kline) < 22: continue
                    lookback = min(len(kline) - 5, max_kline_days - 5)
                    hist, tf = analyze_single(code, kline, idx_data, lookback, share_lookup)
                    if hist: all_hist[code] = hist

                # Step 4: 回测模拟
                job['message'] = '执行回测模拟...'
                result = _run_backtest_sim(all_hist, idx_data, sorted_dates, sorted_all, initial_capital, position_ratio, buy_threshold, fee_rate)
                job['status'] = 'done'; job['result'] = result; job['message'] = '回测完成'

            except Exception as e:
                job = _BACKTEST_JOBS.get(jid)
                if job: job['status'] = 'error'; job['error'] = str(e)
                import traceback; traceback.print_exc()

        t = threading.Thread(target=_run_bt, args=(job_id,), daemon=True)
        t.start()
        return jsonify({"job_id": job_id, "status": "loading_shares", "message": "后台加载中..."})

    # --- 二因子模式（同步，快速）---
    idx_data = fetch_kline("sh000300", max_kline_days)
    all_hist = {}
    share_data = {}
    first_kline = fetch_kline(codes[0], max(60, days + 30))
    if not first_kline: return jsonify({"error": "无法获取K线数据"}), 500
    target_date = first_kline[-1]["date"]
    try: share_data = get_share_data_with_cache(codes, target_date)
    except: pass

    for code in codes:
        kline = fetch_kline(code, max_kline_days)
        if len(kline) < 22: continue
        lookback = min(len(kline) - 5, max_kline_days - 5) if start_date else (days + 5)
        hist, _ = analyze_single(code, kline, idx_data, lookback, share_data)
        if hist: all_hist[code] = hist

    if len(all_hist) < 3: return jsonify({"error": "可分析ETF不足3只"}), 500

    # 按日期组织 + 运行时筛选
    date_map_temp = {}
    for code, hist in all_hist.items():
        for h in hist:
            d = h["d"]
            if d not in date_map_temp: date_map_temp[d] = {}
            date_map_temp[d][code] = h
    all_sorted_dates = sorted(date_map_temp.keys())
    if start_date and end_date:
        sorted_dates = [d for d in all_sorted_dates if start_date <= d <= end_date]
    else:
        sorted_dates = all_sorted_dates[-days:]
    if not sorted_dates: return jsonify({"error": "指定区间内无数据"}), 400

    result = _run_backtest_sim(all_hist, idx_data, sorted_dates, all_sorted_dates, initial_capital, position_ratio, buy_threshold, fee_rate)
    return jsonify(result)


@app.route('/api/backtest/status/<job_id>', methods=['GET'])
def backtest_status(job_id):
    with _BACKTEST_LOCK:
        job = _BACKTEST_JOBS.get(job_id)
    if not job:
        return jsonify({"status": "not_found", "error": "任务不存在"}), 404
    resp = {"status": job["status"], "progress": job.get("progress", 0), "total": job.get("total", 0), "message": job.get("message", "")}
    if job["status"] == "done":
        resp["result"] = job["result"]
        # 清理旧任务(保留5分钟)
        job['_cleanup_at'] = time.time() + 300
    elif job["status"] == "error":
        resp["error"] = job.get("error", "未知错误")
    return jsonify(resp)


# ========== 策略信号摘要看板 ==========
@app.route('/api/strategy/signals', methods=['GET'])
def get_strategy_signals():
    from strategies.grid.config import DEFAULT_CONFIG as GRID_DEFAULT
    from strategies.grid.analyze import analyze_grid
    codes = list(ETFS.keys())
    strategies_list = []

    # 1. 三因子信号
    try:
        idx_data = fetch_kline("sh000300", 60)
        first_kl = fetch_kline(codes[0], 60)
        tgt = first_kl[-1]["date"] if first_kl else datetime.now().strftime('%Y-%m-%d')
        share_data = get_share_data_with_cache(codes, tgt)
        high_c, mid_c = 0, 0
        hs300_codes = ["510300", "510310", "510330", "159919"]
        hs300_high = 0; best_high = None
        for code in codes:
            kline = fetch_kline(code, 60)
            if len(kline) < 22: continue
            hist, _ = analyze_single(code, kline, idx_data, 5, share_data)
            if hist:
                cp = hist[-1].get("cp", 0)
                if cp >= 70:
                    high_c += 1
                    if code in hs300_codes: hs300_high += 1
                    if best_high is None or cp > best_high[1]: best_high = (code, cp, ETFS[code]["n"])
                elif cp >= 50: mid_c += 1
        tf_total = len([c for c in codes if len(fetch_kline(c, 60)) >= 22])
        tf_strength, tf_label = 0, '⚪无信号'
        if high_c >= 3: tf_strength, tf_label = 5, '🔥极强'
        elif hs300_high >= 2: tf_strength, tf_label = 4, '🟢强'
        elif high_c >= 1: tf_strength, tf_label = 3, '🟡中等'
        elif mid_c >= 2: tf_strength, tf_label = 2, '🟡偏弱'
        elif mid_c >= 1: tf_strength, tf_label = 1, '⚪弱'
        suggestion = f"{best_high[0]} {best_high[2]} cp={best_high[1]:.0f}%" if best_high else None
        strategies_list.append({"id": "three_factor", "name": "三因子国家队资金流向", "strength": tf_strength, "label": tf_label, "summary": f'🔴高确信 {high_c} | 🟡中等 {mid_c} | ⚪低 {tf_total - high_c - mid_c}', "suggestion": suggestion})
    except Exception as e:
        strategies_list.append({"id": "three_factor", "name": "三因子", "strength": 0, "label": "❌异常", "summary": str(e)[:60], "suggestion": None})

    # 2. 网格信号
    try:
        bottom_c, top_c, signal_today, mid_c = 0, 0, 0, 0
        best_bottom = None; today_str = datetime.now().strftime('%Y-%m-%d')
        for code in codes:
            kline = fetch_kline(code, 250)
            if len(kline) < 20: continue
            try:
                result = analyze_grid(code, kline, GRID_DEFAULT)
                pos = result.get('position_pct', 50)
                if pos <= 20: bottom_c += 1; best_bottom = (code, pos, ETFS[code]["n"]) if best_bottom is None or pos < best_bottom[1] else best_bottom
                elif pos >= 80: top_c += 1
                else: mid_c += 1
                sig = result.get('recent_signal')
                if sig and sig.get('date') == today_str: signal_today += 1
            except: continue
        g_strength, g_label = 0, '⚪无信号'
        if bottom_c > 0: g_strength, g_label = 5, '🔥极强'
        elif top_c > 0: g_strength, g_label = 3, '🟡中等'
        elif mid_c > 0: g_strength, g_label = 1, '⚪偏弱'
        suggestion_g = f"{best_bottom[0]} {best_bottom[2]} 位置{best_bottom[1]:.0f}%" if best_bottom else None
        strategies_list.append({"id": "grid", "name": "网格交易", "strength": g_strength, "label": g_label, "summary": f"📉底部 {bottom_c} | 📏中枢 {mid_c} | 📈顶部 {top_c}", "suggestion": suggestion_g})
    except Exception as e:
        strategies_list.append({"id": "grid", "name": "网格交易", "strength": 0, "label": "❌异常", "summary": str(e)[:60], "suggestion": None})

    max_str = max(strategies_list, key=lambda x: x['strength'])
    recommended = max_str['id'] if max_str['strength'] > 0 else None
    return jsonify({"strategies": strategies_list, "recommended": recommended, "time": datetime.now().isoformat()})


if __name__ == '__main__':
    print("=" * 60)
    print("ETF三因子 Web 后端服务")
    print("=" * 60)
    print(f"API地址: http://localhost:5000")
    print(f"健康检查: http://localhost:5000/api/health")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)