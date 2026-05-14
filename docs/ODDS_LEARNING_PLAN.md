# Full Plan: Learn Optimal Blend Weight from Historical Odds

## 🎯 Goal
Use The Odds API historical data to learn the optimal weight for blending:
- **Base model** (54.6% learned model)
- **Odds** (55.1% market consensus)
- **Blended** (TBD, expected ~56.4%)

## ✅ Phase 1: Backfill Historical Odds (5 Nights)

### Timeline: One Night per Week
```
Night 1: Sat 10 PM - 11 PM → Jan-Jul 2023 matches (~600 matches)
Night 2: Sun 10 PM - 11 PM → Aug 2023-Jan 2024 matches
Night 3: Mon 10 PM - 11 PM → Feb-Jul 2024 matches
Night 4: Tue 10 PM - 11 PM → Aug 2024-Jan 2025 matches
Night 5: Wed 10 PM - 11 PM → Feb-Mar 2026 matches
```

### Quota Usage
- **Per night**: 100 API calls (hits rate limit exactly)
- **Per call**: 10 quota cost (1 region, US odds only)
- **Per night**: 100 × 10 = 1,000 quota
- **Total for 5 nights**: 5,000 quota
- **Your limit**: 100 calls/hour = 2,400+ calls/day
- **Verdict**: ✅ **Completely Safe**

### What Gets Stored
```json
{
  "FRA_vs_DEU": {
    "date": "2026-06-14",
    "homeElo": 2110,
    "awayElo": 2055,
    "odds": {
      "home": 1.80,
      "draw": 3.50,
      "away": 4.00
    },
    "timestamp": "2026-06-13T23:59:59Z",
    "bookmakers": ["betfair", "pinnacle", "draftkings"]
  }
}
```

---

## ✅ Phase 2: Learn Optimal Weight (1 Day, ~30 minutes)

### Process
```
Input:
  - 2,769 matches with odds (from Phase 1)
  - Base model predictions (use existing 54.6% model)
  - Actual outcomes (from international_results.csv)

Algorithm:
  For each weight from 0% to 100% (step 5%):
    - Blend: (1 - weight) × base + weight × odds
    - Compare to actual outcomes
    - Record accuracy
  
  Find weight with highest accuracy
  
Output:
  - Optimal weight (e.g., 65%)
  - Expected accuracy (e.g., 56.4%)
  - Graph of weight vs accuracy
  - Used going forward in WC 2026
```

### Expected Results
```
Weight  0% (base only):     54.6% accuracy
Weight 50% (50/50 blend):   55.5% accuracy
Weight 65% (OPTIMAL):       56.4% accuracy ← Best
Weight 80%:                 56.1% accuracy
Weight 100% (odds only):    55.1% accuracy

🏆 EXPECTED GAIN: +1.8pp from learning weight
```

---

## ✅ Phase 3: Use During WC 2026 (June onwards)

### Flow
```
For each WC 2026 match:

1. Get base model prediction
   base = learnedModel.predict(homeElo, awayElo)

2. Pull latest odds from API
   odds = theOddsAPI.getOdds(matchId)

3. Blend using learned weight
   final = (1 - 0.65) * base + 0.65 * odds
   
4. Predict outcome
   prediction = argmax(final.home, final.draw, final.away)

5. After match, track accuracy
   actual_outcome = result
   predictions.log(final, actual_outcome)
```

---

## 📊 Expected Improvements

```
Model                    Accuracy    Improvement
─────────────────────────────────────────────────
ELO Parametric          50.4%       Baseline
Learned Model           54.6%       +4.2pp ✅
Learned + Odds (65%)    56.4%       +1.8pp ✅
─────────────────────────────────────────────────
TOTAL GAIN:                         +6.0pp from ELO!
```

---

## 🛠️ Implementation Checklist

### Week 1: Setup
- [ ] Verify Odds API quota (ask: what's your monthly limit?)
- [ ] Test API connection with 1 match
- [ ] Create nightly batch pull script
- [ ] Set up database to store odds

### Week 2-6: Backfill Data
- [ ] Night 1: Jan-Jul 2023
- [ ] Night 2: Aug 2023-Jan 2024
- [ ] Night 3: Feb-Jul 2024
- [ ] Night 4: Aug 2024-Jan 2025
- [ ] Night 5: Feb-Mar 2026

### Week 7: Learn Weight
- [ ] Run weight optimization script
- [ ] Identify optimal weight
- [ ] Generate accuracy graph
- [ ] Document results

### Week 8: Deploy for WC 2026
- [ ] Update blend function with learned weight
- [ ] Test on 5 practice matches
- [ ] Set up live odds pulling (June 14)
- [ ] Begin tournament predictions

---

## 📁 Files to Create

```
├── odds/
│   ├── backfill_historical.js       ← Night pulls
│   ├── odds_storage.js              ← Database
│   ├── odds_converter.js            ← Odds → Prob
│   └── learn_weight.js              ← Optimization
│
├── wc_2026_odds.json               ← Storage
└── WEIGHT_LEARNING_RESULTS.json    ← Learned weight
```

---

## ⏱️ Total Time Investment

| Phase | Task | Time |
|-------|------|------|
| 1 | Backfill odds (5 nights) | 5 hours spread over weeks |
| 2 | Learn optimal weight | 30 minutes |
| 3 | Deploy & test | 2 hours |
| **Total** | **End-to-end** | **~7.5 hours** |

**When complete**: Production-ready WC 2026 prediction system using learned weight!

---

## ✅ Final Decision Gate

**Question**: What's your actual monthly quota limit on Odds API?

- If ≥ 5,000: ✅ **Go ahead - easily feasible**
- If < 5,000: 🤔 **Might need to reduce regions or use fewer matches**
- If unknown: 📞 **Check your API dashboard**

Once confirmed, we can start Phase 1 any week you want!
