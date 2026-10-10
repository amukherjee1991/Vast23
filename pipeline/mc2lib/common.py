"""Shared helpers for the MC2 pipeline: loading, month indexing, fish flags, JSON output."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
EDGES = ROOT / "data/processed/mc2_edges.parquet"
NODES = ROOT / "data/processed/mc2_nodes.parquet"
BUNDLE_DIR = ROOT / "data/raw/mc2/bundles"
OUT = ROOT / "app/public/data/mc2"

YEAR0 = 2028
N_MONTHS = 84  # 2028-01 .. 2034-12
DATA_END_MONTH = N_MONTHS - 1
BUNDLES = ["carp", "catfish", "chub_mackerel", "cod2", "herring", "lichen",
           "mackerel", "pollock", "salmon", "salmon_wgl", "shark", "tuna"]

# HS codes in this dataset are stored as integers, so chapter 03 lost its leading
# zero: "306170" == 0306.17.0. Pharmaceutical chapter 30 headings are 3001-3006,
# which appear as "300xxx". Fish = headings 0301-0309 ("301".."309") + 1604/1605.
FISH_HEADINGS = {"0301": "Live fish", "0302": "Fresh/chilled fish", "0303": "Frozen fish",
                 "0304": "Fish fillets", "0305": "Dried/smoked/salted fish",
                 "0306": "Crustaceans", "0307": "Molluscs", "0308": "Other aquatic invertebrates",
                 "0309": "Fish flours/meals", "1604": "Prepared/preserved fish",
                 "1605": "Prepared crustaceans/molluscs"}


def month_labels():
    return [f"{YEAR0 + m // 12}-{m % 12 + 1:02d}" for m in range(N_MONTHS)]


def month_index(dates: pd.Series) -> np.ndarray:
    d = pd.to_datetime(dates)
    return ((d.dt.year - YEAR0) * 12 + d.dt.month - 1).to_numpy()


def hs_heading(hs: pd.Series) -> pd.Series:
    """Normalise a raw hscode string to a 4-digit HS heading with the leading zero restored."""
    hs = hs.astype(str)
    is_ch03 = hs.str.match(r"^30[1-9]") & (hs.str.len() == 6)
    head = hs.str[:4]
    return head.where(~is_ch03, "0" + hs.str[:3])


def is_fish(hs: pd.Series) -> np.ndarray:
    return hs_heading(hs).isin(FISH_HEADINGS.keys()).to_numpy()


def load_edges() -> pd.DataFrame:
    e = pd.read_parquet(EDGES)
    n0 = len(e)
    e = e.drop_duplicates().reset_index(drop=True)
    e.attrs["n_raw"] = n0
    e["m"] = month_index(e["arrivaldate"]).astype(np.int16)
    e["hs4"] = hs_heading(e["hscode"])
    e["fish"] = e["hs4"].isin(FISH_HEADINGS.keys())
    return e


def load_bundle(name: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    with open(BUNDLE_DIR / f"{name}.json") as f:
        d = json.load(f)
    links = pd.DataFrame(d["links"])
    for c in ["weightkg", "volumeteu", "valueofgoods_omu"]:
        if c not in links:
            links[c] = np.nan
    links["hscode"] = links["hscode"].astype(str)
    links["source"] = links["source"].astype(str)
    links["target"] = links["target"].astype(str)
    links["arrivaldate"] = pd.to_datetime(links["arrivaldate"])
    links["m"] = month_index(links["arrivaldate"])
    links["hs4"] = hs_heading(links["hscode"])
    links["fish"] = links["hs4"].isin(FISH_HEADINGS.keys())
    nodes = pd.DataFrame(d["nodes"])
    return links, nodes


def _clean(o, nd=4):
    if isinstance(o, dict):
        return {str(k): _clean(v, nd) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v, nd) for v in o]
    if isinstance(o, np.ndarray):
        return [_clean(v, nd) for v in o.tolist()]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (float, np.floating)):
        f = float(o)
        if math.isnan(f) or math.isinf(f):
            return None
        if f == int(f) and abs(f) < 1e15:
            return int(f)
        return float(f"{f:.{nd}g}")
    if isinstance(o, pd.Timestamp):
        return o.strftime("%Y-%m-%d")
    if o is pd.NA or o is pd.NaT:
        return None
    return o


def write_json(name: str, obj) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    txt = json.dumps(_clean(obj), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(txt, encoding="utf-8")
    return len(txt.encode("utf-8"))


def series(counts_by_month: dict | pd.Series, n=N_MONTHS) -> list[int]:
    s = [0] * n
    for k, v in dict(counts_by_month).items():
        if 0 <= int(k) < n:
            s[int(k)] = int(v)
    return s
