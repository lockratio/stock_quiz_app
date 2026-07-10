"""
build_data.py  —  Stock Universe quiz data pipeline
====================================================

Reads the source universe CSVs from Bank_DATABASE, cleans + derives fields,
stacks the two company_descriptions files into one master table (QAID unique),
and writes the two artefacts the web app consumes:

    data/universe.csv     big, lazy-loaded : one row per stock, cleaned + derived
    data/reference.json   small, instant   : taxonomy + country/currency/flag + quickview

Re-runnable. Nothing here is shipped at runtime; the app only fetches data/*.
Source of truth for gsector / gindustry is the GICS code (see GICS_L1 / GICS_L2),
converted from the project's R create_gics_* functions. Join key is QAID only.

Usage:  python tools/build_data.py
"""
from __future__ import annotations
import csv, json, os, re, sys
from pathlib import Path

SRC = Path(r"C:/Users/lachl/OneDrive - Lock Ratio/LockRatioOneDrive/Bank_DATABASE/RESEARCH/univ_info/csvs")
OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(parents=True, exist_ok=True)

DESC_FILES = ["company_descriptions_asx300.csv", "company_descriptions_msciacwi.csv"]

# ---------------------------------------------------------------- GICS maps
# Derived exactly from the project's R create_gics_sector / create_gics_industry.
GICS_L1 = {
    10: "energy", 15: "materials", 20: "industrials", 25: "consumer_discretionary",
    30: "consumer_staples", 35: "health_care", 40: "financials",
    45: "information_technology", 50: "communication_services", 55: "utilities",
    60: "real_estate",
}
GICS_L2 = {
    1010: "energy", 1510: "materials", 2010: "capital_goods", 2020: "prof_services",
    2030: "transport", 2510: "autos_components", 2520: "durables_apparel",
    2530: "consumer_services", 2550: "cd_retail", 3010: "cs_retail",
    3020: "food_bev_tobacco", 3030: "household_personal", 3510: "hc_equip_services",
    3520: "pharma_biotech_life", 4010: "banks", 4020: "financial_services",
    4030: "insurance", 4040: "real_estate_fin", 4510: "software_services",
    4520: "tech_hw", 4530: "semis", 5010: "telecom", 5020: "media_ent",
    5510: "utilities", 6010: "real_estate",
    # 6020 (Real Estate Mgmt & Development) not in the R map; same sector -> real_estate
    6020: "real_estate",
}
# Canonical 2-digit GICS sector number + 4-letter code (taxonomy metadata).
SECTOR_CODE = {
    "energy": ("10", "ENRS"), "materials": ("15", "MATR"), "industrials": ("20", "INDU"),
    "consumer_discretionary": ("25", "COND"), "consumer_staples": ("30", "CONS"),
    "health_care": ("35", "HLTH"), "financials": ("40", "FINL"),
    "information_technology": ("45", "INFT"), "communication_services": ("50", "TELS"),
    "utilities": ("55", "UTIL"), "real_estate": ("60", "REAL"),
}

# ---------------------------------------------------------------- region map
# Display grouping (US / JP / EU / AP / EE) keyed by ISO-2 country, MSCI-ish.
REGION = {}
for iso in ["US"]: REGION[iso] = "US"
for iso in ["JP"]: REGION[iso] = "JP"
for iso in ["GB","DE","FR","CH","NL","ES","IT","SE","DK","FI","NO","IE","BE","AT","PT"]:
    REGION[iso] = "EU"
for iso in ["AU","NZ","HK","SG","TW","KR","CN","IN","TH","MY","ID","PH"]:
    REGION[iso] = "AP"
for iso in ["SA","BR","MX","ZA","PE","IL"]:
    REGION[iso] = "EE"
for iso in ["CA"]: REGION[iso] = "CA"   # Canada is its own display region
REGION_NAME = {"US": "United States", "JP": "Japan", "EU": "Europe",
               "AP": "Asia-Pacific", "EE": "Emerging (ex-Asia)", "CA": "Canada"}

# Clean display names for messy source country strings (applied everywhere).
COUNTRY_DISPLAY = {
    "Korea; Republic (S. Korea)": "South Korea",
    "United States of America": "United States",
}

# ---------------------------------------------------------------- helpers
def money(s: str):
    """' $6,793,285.08 ' -> 6793285.08 ; blank/NA -> None"""
    if s is None: return None
    t = re.sub(r"[^0-9.\-]", "", str(s))
    if t in ("", "-", "."): return None
    try: return round(float(t), 2)
    except ValueError: return None

def pct(s: str):
    """'11.12%' -> 11.12 ; blank -> None"""
    if s is None: return None
    t = str(s).replace("%", "").strip()
    try: return round(float(t), 4)
    except ValueError: return None

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

def parse_ticker(ticker: str):
    """Split a Bloomberg ticker into (symbol, ticker_code, numeric_ticker, first_letter).

    Handles both source formats:
      'BHP AU'          -> ('BHP',  'AU', False, 'B')   ASX form (no Equity suffix)
      '1929 HK Equity'  -> ('1929', 'HK', True,  '1')   ACWI numeric listing
      'UCG IM Equity'   -> ('UCG',  'IM', False, 'U')   ACWI alpha listing
      'ACWA AB EQUITY'  -> ('ACWA', 'AB', False, 'A')   'Equity' matched case-insensitively
    """
    toks = (ticker or "").split()
    if toks and toks[-1].upper() == "EQUITY":
        toks = toks[:-1]
    if len(toks) >= 2:
        code = toks[-1]
        symbol = " ".join(toks[:-1])
    else:
        code = ""
        symbol = toks[0] if toks else ""
    numeric = symbol.isdigit()
    fl = ""
    for ch in symbol:
        if ch.isalnum():
            fl = ch.upper()
            break
    return symbol, code, numeric, fl

def flag(iso2: str) -> str:
    """ISO-2 -> regional-indicator flag emoji."""
    iso2 = (iso2 or "").upper()
    if len(iso2) != 2 or not iso2.isalpha(): return ""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in iso2)

def read_csv(path: Path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))

# ---------------------------------------------------------------- currency
def load_fx():
    rows = read_csv(SRC / "univ_country_fx.csv")
    by_name = {}
    for r in rows:
        name = COUNTRY_DISPLAY.get(r["country"].strip(), r["country"].strip())
        by_name[norm(name)] = (r["currency"].strip(), r["currency_iso"].strip())
    return by_name

def currency_for(country_name: str, fx_by_name: dict):
    # country_name is already display-normalised ("South Korea" matches univ_country_fx)
    return fx_by_name.get(norm(country_name), (None, None))

# ---------------------------------------------------------------- index meta
def load_indices():
    rows = read_csv(SRC / "univ_index.csv")
    out = []
    for r in rows:
        name = (r.get("Name") or "").strip()
        if not name: continue
        out.append({
            "name": name,
            "aware_id": (r.get("aware_id") or "").strip(),
            "asx_index_code": (r.get("asx_index_code") or "").strip(),
            "bbg_code": (r.get("bbg_code") or "").strip(),
        })
    return out

# ---------------------------------------------------------------- build master
def build():
    fx_by_name = load_fx()
    fx_unmatched = set()
    rows = []

    for fname in DESC_FILES:
        path = SRC / fname
        if not path.exists():
            sys.exit(f"MISSING SOURCE: {path}")
        for r in read_csv(path):
            gics_raw = (r.get("GICS") or "").strip()
            try:
                gics = int(float(gics_raw))
            except (ValueError, TypeError):
                gics = None
            l1 = gics // 1_000_000 if gics else None
            l2 = gics // 10_000 if gics else None
            gsector = GICS_L1.get(l1)
            gindustry = GICS_L2.get(l2)
            # country_name column differs between the two files
            cname = (r.get("country_name") or r.get("Country_Name") or "").strip()
            cname = COUNTRY_DISPLAY.get(cname, cname)
            iso2 = (r.get("country") or "").strip().upper()
            cur, cur_iso = currency_for(cname, fx_by_name)
            if cur is None and cname:
                fx_unmatched.add(cname)
            sec_num, sec_code = SECTOR_CODE.get(gsector, ("", ""))
            ticker_raw = (r.get("bbg_ticker") or "").strip()
            symbol, ticker_code, numeric_ticker, first_letter = parse_ticker(ticker_raw)
            rows.append({
                "qaid": (r.get("QAID") or "").strip(),
                "index_code": (r.get("IndexCode") or "").strip(),
                "ticker": ticker_raw,
                "symbol": symbol,
                "ticker_code": ticker_code,
                "numeric_ticker": numeric_ticker,
                "first_letter": first_letter,
                "name": (r.get("tr_name") or "").strip(),
                "legal_name": (r.get("legal_name") or "").strip(),
                "iso2": iso2,
                "country": cname,
                "region": REGION.get(iso2, ""),
                "mag7": False,   # set below: top-7 by USD mktcap within MSCIACWI
                "gsector": gsector or "",
                "gindustry": gindustry or "",
                "gics": gics_raw,
                "sector_num": sec_num,
                "sector_code": sec_code,
                "exchange": (r.get("tr_exchange_code") or "").strip(),
                "currency": cur or "",
                "currency_iso": cur_iso or "",
                "mktcap_aud_mln": money(r.get("market_cap_AUD_Mln")),
                "mktcap_usd_mln": money(r.get("market_cap_USD_Mln")),
                "bm_weight": pct(r.get("bm_weight")),
                "desc": re.sub(r"\s+", " ", (r.get("business_desc") or "").strip()),
            })

    # QAID uniqueness sanity
    qaids = [x["qaid"] for x in rows if x["qaid"]]
    dupes = {q for q in qaids if qaids.count(q) > 1}
    if dupes:
        print(f"WARNING: {len(dupes)} duplicate QAID(s) across stack (first few): "
              f"{list(dupes)[:5]}")

    # -------------------------------------------------- mag7 flag
    # Top-7 by USD market cap within the MSCIACWI index.
    acwi = [r for r in rows if r["index_code"] == "MSCIACWI"]
    mag7_rows = sorted(acwi, key=lambda x: (x["mktcap_usd_mln"] or 0), reverse=True)[:7]
    for r in mag7_rows:
        r["mag7"] = True

    # -------------------------------------------------- region completeness
    blank_regions = [r for r in rows if not r["region"]]
    assert not blank_regions, (
        f"{len(blank_regions)} rows with blank region; first iso2s: "
        f"{sorted({r['iso2'] for r in blank_regions})[:10]}")

    # -------------------------------------------------- write universe.csv
    cols = ["qaid","index_code","ticker","symbol","ticker_code","numeric_ticker",
            "first_letter","mag7","name","legal_name","iso2","country",
            "region","gsector","gindustry","gics","sector_num","sector_code",
            "exchange","currency","currency_iso","mktcap_aud_mln","mktcap_usd_mln",
            "bm_weight","desc"]
    with open(OUT / "universe.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    # -------------------------------------------------- reference.json
    def sort_cap(xs):
        return sorted(xs, key=lambda x: (x["mktcap_aud_mln"] or 0), reverse=True)

    sectors = []
    for key in GICS_L1.values():
        if key in {r["gsector"] for r in rows}:
            num, code = SECTOR_CODE[key]
            sectors.append({"key": key, "name": key.replace("_", " ").title(),
                            "num": num, "code": code})
    industries = []
    seen_ind = {}
    for r in rows:
        gi = r["gindustry"]
        if gi and gi not in seen_ind:
            seen_ind[gi] = r["gsector"]
    for gi, sec in seen_ind.items():
        industries.append({"key": gi, "name": gi.replace("_", " ").title(),
                           "sector": sec})

    countries = {}
    for r in rows:
        if r["iso2"] and r["iso2"] not in countries:
            countries[r["iso2"]] = {
                "iso2": r["iso2"], "name": r["country"], "flag": flag(r["iso2"]),
                "region": r["region"], "region_name": REGION_NAME.get(r["region"], ""),
                "currency": r["currency"], "currency_iso": r["currency_iso"],
            }
    exchanges = sorted({r["exchange"] for r in rows if r["exchange"]})
    regions = [{"key": k, "name": v} for k, v in REGION_NAME.items()]
    index_codes = sorted({r["index_code"] for r in rows if r["index_code"]})

    def light(r):  # compact stock record for quickview
        return {"qaid": r["qaid"], "ticker": r["ticker"], "name": r["name"],
                "iso2": r["iso2"], "country": r["country"], "region": r["region"],
                "gsector": r["gsector"], "gindustry": r["gindustry"],
                "exchange": r["exchange"], "cap": r["mktcap_aud_mln"]}

    top_global = [light(r) for r in sort_cap(rows)[:25]]
    top_by_sector = {}
    for sec in {r["gsector"] for r in rows if r["gsector"]}:
        top_by_sector[sec] = [light(r) for r in sort_cap([x for x in rows if x["gsector"] == sec])[:10]]
    top_by_country = {}
    for iso in countries:
        top_by_country[iso] = [light(r) for r in sort_cap([x for x in rows if x["iso2"] == iso])[:5]]
    mag7_quickview = [light(r) for r in sort_cap([x for x in rows if x["mag7"]])]

    reference = {
        "meta": {
            "generated_from": "company_descriptions_asx300 + company_descriptions_msciacwi",
            "total_stocks": len(rows),
            "index_codes": index_codes,
            "counts": {"sectors": len(sectors), "industries": len(industries),
                       "countries": len(countries), "exchanges": len(exchanges)},
        },
        "sectors": sectors,
        "industries": industries,
        "countries": sorted(countries.values(), key=lambda c: c["name"]),
        "regions": regions,
        "exchanges": exchanges,
        "indices": load_indices(),
        "quickview": {
            "top_global": top_global,
            "top_by_sector": top_by_sector,
            "top_by_country": top_by_country,
            "mag7": mag7_quickview,
        },
    }
    with open(OUT / "reference.json", "w", encoding="utf-8") as f:
        json.dump(reference, f, ensure_ascii=False, indent=1)

    # -------------------------------------------------- report
    print(f"universe.csv    {len(rows)} rows -> {OUT/'universe.csv'}")
    print(f"reference.json  sectors={len(sectors)} industries={len(industries)} "
          f"countries={len(countries)} exchanges={len(exchanges)} indices={len(reference['indices'])}")
    caps_missing = sum(1 for r in rows if r["mktcap_aud_mln"] is None)
    gi_missing = sum(1 for r in rows if not r["gindustry"])
    print(f"missing mktcap_aud={caps_missing}  missing gindustry={gi_missing}")
    if fx_unmatched:
        print(f"NO CURRENCY MATCH for: {sorted(fx_unmatched)}")

    # -------------------------------------------------- Wave-1 verification
    n_blank = sum(1 for r in rows if not r["region"])
    n_mag7 = sum(1 for r in rows if r["mag7"])
    n_numeric = sum(1 for r in rows if r["numeric_ticker"])
    print(f"blank_regions={n_blank}  mag7_rows={n_mag7}  numeric_ticker={n_numeric}")
    print("mag7 companies (cap-desc): " +
          ", ".join(r["name"] for r in mag7_rows))
    print("sample ticker transforms:")
    seen_iso = set()
    for want in ["US", "HK", "JP", "AU", "IT"]:
        for r in rows:
            if r["iso2"] == want and want not in seen_iso:
                print(f"  {r['ticker']!r:24} -> {r['symbol']!s:8} | "
                      f"{r['ticker_code']!s:4} | numeric={r['numeric_ticker']!s:5} | "
                      f"first={r['first_letter']}")
                seen_iso.add(want)
                break
    print("done.")

if __name__ == "__main__":
    build()
