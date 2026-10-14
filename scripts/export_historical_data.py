#!/usr/bin/env python3
"""
Export real historical market datasets from local SQLite database (strategy-tester.db)
and prepare compressed JSON artifacts for GCP Cloud Storage.
"""

import sqlite3
import json
import gzip
import os
import sys

DB_PATH = 'data/strategy-tester.db'
OUT_DIR = 'data/export'

def resample_15m_to_30m(candles):
    """Resample 15M candles into 30M candles."""
    res = []
    bucket_ms = 30 * 60 * 1000
    current_bucket = None
    cur = None

    for c in candles:
        ts = c['timestamp']
        bucket = (ts // bucket_ms) * bucket_ms
        if bucket != current_bucket:
            if cur is not None:
                res.append(cur)
            current_bucket = bucket
            cur = {
                'timestamp': bucket,
                'open': c['open'],
                'high': c['high'],
                'low': c['low'],
                'close': c['close'],
                'volume': c['volume']
            }
        else:
            cur['high'] = max(cur['high'], c['high'])
            cur['low'] = min(cur['low'], c['low'])
            cur['close'] = c['close']
            cur['volume'] += c['volume']

    if cur is not None:
        res.append(cur)
    return res

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found!")
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    targets = [
        {'id': 2, 'symbol': 'XAUUSD', 'timeframe': '1D'},
        {'id': 3, 'symbol': 'XAUUSD', 'timeframe': '4H'},
        {'id': 4, 'symbol': 'XAUUSD', 'timeframe': '1H'},
        {'id': 6, 'symbol': 'XAUUSD', 'timeframe': '15M'},
        {'id': 7, 'symbol': 'GBPUSD', 'timeframe': '1H'}
    ]

    manifest = []

    for t in targets:
        ds_id = t['id']
        symbol = t['symbol']
        tf = t['timeframe']
        print(f"Exporting {symbol} {tf} (Dataset #{ds_id})...")

        cursor.execute(
            'SELECT timestamp, open, high, low, close, volume FROM candles WHERE dataset_id = ? ORDER BY timestamp ASC',
            (ds_id,)
        )
        rows = cursor.fetchall()
        candles = [
            {
                'timestamp': r[0],
                'open': round(float(r[1]), 3),
                'high': round(float(r[2]), 3),
                'low': round(float(r[3]), 3),
                'close': round(float(r[4]), 3),
                'volume': round(float(r[5] or 0), 2)
            }
            for r in rows
        ]

        # Write JSON
        json_path = os.path.join(OUT_DIR, f"{symbol}_{tf}.json")
        with open(json_path, 'w') as f:
            json.dump(candles, f)

        # Write Gzip
        gz_path = os.path.join(OUT_DIR, f"{symbol}_{tf}.json.gz")
        with gzip.open(gz_path, 'wb') as f:
            f.write(json.dumps(candles).encode('utf-8'))

        raw_size = os.path.getsize(json_path) / 1024
        gz_size = os.path.getsize(gz_path) / 1024
        print(f"  -> {len(candles):,} candles ({raw_size:.1f} KB raw, {gz_size:.1f} KB gzipped)")

        manifest.append({
            'symbol': symbol,
            'timeframe': tf,
            'startTs': candles[0]['timestamp'],
            'endTs': candles[-1]['timestamp'],
            'candleCount': len(candles),
            'filename': f"{symbol}_{tf}.json",
            'gzFilename': f"{symbol}_{tf}.json.gz"
        })

        # Generate 30M from 15M
        if tf == '15M' and symbol == 'XAUUSD':
            print("Generating XAUUSD 30M by resampling 15M...")
            candles_30m = resample_15m_to_30m(candles)
            json_30m = os.path.join(OUT_DIR, f"{symbol}_30M.json")
            with open(json_30m, 'w') as f:
                json.dump(candles_30m, f)
            gz_30m = os.path.join(OUT_DIR, f"{symbol}_30M.json.gz")
            with gzip.open(gz_30m, 'wb') as f:
                f.write(json.dumps(candles_30m).encode('utf-8'))
            print(f"  -> {len(candles_30m):,} 30M candles ({os.path.getsize(json_30m)/1024:.1f} KB raw, {os.path.getsize(gz_30m)/1024:.1f} KB gzipped)")

            manifest.append({
                'symbol': symbol,
                'timeframe': '30M',
                'startTs': candles_30m[0]['timestamp'],
                'endTs': candles_30m[-1]['timestamp'],
                'candleCount': len(candles_30m),
                'filename': f"{symbol}_30M.json",
                'gzFilename': f"{symbol}_30M.json.gz"
            })

    # Save manifest index.json
    manifest_path = os.path.join(OUT_DIR, 'index.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\nWrote manifest index with {len(manifest)} datasets to {manifest_path}")

if __name__ == '__main__':
    main()
