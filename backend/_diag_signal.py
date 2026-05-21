import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strategies.grid.analyze import analyze_grid
from strategies.grid.config import DEFAULT_CONFIG
from server import fetch_kline, ETFS

print("=== Check recent_signal from analyze.py ===")
for code, info in ETFS.items():
    kline = fetch_kline(code, 250)
    if len(kline) < 20:
        continue
    result = analyze_grid(code, kline, DEFAULT_CONFIG)
    sig = result.get('recent_signal')
    pos = result.get('position_pct', 0)
    print(f"{code} {info['n']}: pos={pos}% recent_signal={sig}")