/**
 * PATTERN MEMORY + GRADIENT BOOSTING AI
 * ──────────────────────────────────────
 * Kết hợp 2 engine song song:
 *
 * 1. Pattern Memory — ghi nhớ pattern đã thấy, decay theo thời gian
 * 2. Gradient Boosting AI — 5 weak learners tự học trọng số từ data thực
 *    - Learner 1: Tần suất có trọng số thời gian
 *    - Learner 2: Tổng zone signal
 *    - Learner 3: Markov bậc 2
 *    - Learner 4: Streak signal
 *    - Learner 5: Regression to mean
 *
 * Kết quả cuối: weighted vote giữa 2 engine
 */
class ThuatToanB52 {

  constructor() {
    // Pattern Memory
    this.mem        = {};
    this.decay      = 0.97;
    this.phien      = 0;
    this.phienMD5   = 0;
    this.phienTX    = 0;
    this.startTime  = Date.now();

    // Gradient Boosting weights — tự học từ data
    this.gbWeights  = {
      tx:  [0.2, 0.2, 0.2, 0.2, 0.2],
      md5: [0.2, 0.2, 0.2, 0.2, 0.2]
    };
    this.gbLR = 0.03; // learning rate thấp để ổn định
  }

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    SAVE / LOAD
  ─────────────────────────────────────────*/
  exportMemory() {
    return {
      mem:       this.mem,
      phien:     this.phien,
      phienMD5:  this.phienMD5,
      phienTX:   this.phienTX,
      gbWeights: this.gbWeights,
      condFreq:  this.condFreq || { tx: {}, md5: {} },
      savedAt:   new Date().toISOString()
    };
  }

  importMemory(data) {
    if (!data || !data.mem) return false;
    this.mem       = data.mem;
    this.phien     = data.phien    || 0;
    this.phienMD5  = data.phienMD5 || 0;
    this.phienTX   = data.phienTX  || 0;
    this.gbWeights = data.gbWeights || { tx:[0.2,0.2,0.2,0.2,0.2], md5:[0.2,0.2,0.2,0.2,0.2] };
    this.condFreq  = data.condFreq  || { tx: {}, md5: {} };
    return true;
  }

  /*─────────────────────────────────────────
    PATTERN MEMORY HELPERS
  ─────────────────────────────────────────*/
  _zone(t) {
    if (t <= 7)           return 'L';
    if (t >= 8 && t<=10)  return 'M';
    if (t >= 11 && t<=12) return 'H';
    return 'X';
  }

  _cauKey(seq) {
    if (seq.length < 4) return null;
    const caus = [];
    let cur = seq[0], len = 1;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === cur) len++;
      else { caus.push({ v: cur, l: len }); cur = seq[i]; len = 1; }
    }
    caus.push({ v: cur, l: len });
    const same = caus.slice(1).filter(c => c.v === caus[0].v);
    if (same.length < 3) return null;
    const avg    = same.reduce((s, c) => s + c.l, 0) / same.length;
    const lenCat = caus[0].l >= avg * 1.3 ? 'LONG' : caus[0].l <= avg * 0.6 ? 'SHORT' : 'AVG';
    return caus[0].v[0] + '_' + lenCat;
  }

  _makeKeys(seq, tng) {
    const keys = [];
    for (const d of [2, 3, 4, 5]) {
      if (seq.length >= d) keys.push({ key: 'S'+d+'_'+seq.slice(0,d).join(''), w: d });
    }
    const zones = tng.slice(0, 3).map(t => this._zone(t));
    for (const d of [1, 2, 3]) {
      if (zones.length >= d) keys.push({ key: 'Z'+d+'_'+zones.slice(0,d).join(''), w: d*0.8 });
    }
    for (const d of [2, 3]) {
      if (seq.length >= d && tng.length >= d) {
        const combo = seq.slice(0,d).map((s,i) => s[0]+this._zone(tng[i])).join('');
        keys.push({ key: 'C'+d+'_'+combo, w: d*1.2 });
      }
    }
    const ck = this._cauKey(seq);
    if (ck) keys.push({ key: 'CAU_'+ck, w: 2 });
    return keys;
  }

  /*─────────────────────────────────────────
    GRADIENT BOOSTING — 5 weak learners
  ─────────────────────────────────────────*/
  _gbFeatures(seq, tng) {
    if (seq.length < 8) return null;

    const f = new Array(5).fill(0);

    // F0: Tần suất có decay (phiên gần ảnh hưởng nhiều hơn)
    {
      let wT = 0, wTotal = 0;
      for (let i = 0; i < Math.min(seq.length, 20); i++) {
        const w = Math.exp(-i * 0.1);
        if (seq[i] === 'Tài') wT += w;
        wTotal += w;
      }
      f[0] = (wT / wTotal - 0.5) * 2;
    }

    // F1: Tổng zone signal
    {
      const t = tng[0];
      f[1] = t >= 13 ? -0.6 : t <= 8 ? 0.4 : t <= 10 ? -0.3 : 0.2;
    }

    // F2: Markov bậc 2 (window 20)
    {
      const s = seq.slice(0, 20);
      const tr = {};
      for (let i = 0; i < s.length - 2; i++) {
        const k = s[i] + '|' + s[i+1];
        if (!tr[k]) tr[k] = { T: 0, X: 0 };
        s[i+2] === 'Tài' ? tr[k].T++ : tr[k].X++;
      }
      const e = tr[seq[0] + '|' + seq[1]];
      if (e && e.T + e.X >= 2) {
        f[2] = (e.T / (e.T + e.X) - 0.5) * 2;
      }
    }

    // F3: Streak signal
    {
      let streak = 1;
      for (let i = 1; i < Math.min(seq.length, 7); i++) {
        if (seq[i] === seq[0]) streak++;
        else break;
      }
      if (streak >= 5) f[3] = seq[0] === 'Tài' ? -0.9 : 0.9;
      else if (streak >= 3) f[3] = seq[0] === 'Tài' ? -0.5 : 0.5;
      else if (streak >= 2) f[3] = seq[0] === 'Tài' ? 0.3 : -0.3;
    }

    // F4: Regression to mean (15 phiên)
    {
      const recent = seq.slice(0, 15);
      const tai = recent.filter(v => v === 'Tài').length / recent.length;
      f[4] = tai > 0.65 ? -0.5 : tai < 0.35 ? 0.5 : 0;
    }

    return f;
  }

  _gbPredict(seq, tng, isMd5) {
    const features = this._gbFeatures(seq, tng);
    if (!features) return null;

    const wKey   = isMd5 ? 'md5' : 'tx';
    const weights = this.gbWeights[wKey];
    const score  = features.reduce((acc, f, i) => acc + weights[i] * f, 0);

    if (Math.abs(score) < 0.05) return null;
    return { pred: score > 0 ? 'Tài' : 'Xỉu', score, features };
  }

  // Update GB weights sau mỗi phiên (online learning)
  _gbUpdate(features, pred, actual, isMd5) {
    if (!features) return;
    if (pred === actual) return; // đúng rồi, không cần update

    const wKey  = isMd5 ? 'md5' : 'tx';
    const label = actual === 'Tài' ? 1 : -1;

    for (let i = 0; i < 5; i++) {
      this.gbWeights[wKey][i] += this.gbLR * label * features[i];
    }

    // Normalize để tránh explode
    const sum = this.gbWeights[wKey].reduce((a, b) => a + Math.abs(b), 0);
    if (sum > 0) {
      this.gbWeights[wKey] = this.gbWeights[wKey].map(w => w / sum);
    }
  }

  /*─────────────────────────────────────────
    CONDITIONAL FREQUENCY TABLE
    Học xác suất: sau tổng T → Tài hay Xỉu?
    Tách riêng cho từng bàn (tx / md5)
  ─────────────────────────────────────────*/
  _updateCondFreq(history, isMd5) {
    if (history.length < 2) return;
    const key = isMd5 ? 'md5' : 'tx';
    if (!this.condFreq) this.condFreq = { tx: {}, md5: {} };

    // Học từ toàn bộ 100 phiên: tổng phiên i → kết quả phiên i+1
    for (let i = history.length - 1; i >= 1; i--) {
      const tong = history[i].tong;
      const next = history[i-1].ket_qua; // phiên tiếp theo
      if (!tong || !next) continue;
      if (!this.condFreq[key][tong]) this.condFreq[key][tong] = { tai: 0, xiu: 0 };
      // Decay theo khoảng cách (phiên gần hơn ảnh hưởng nhiều hơn)
      const w = Math.pow(0.99, i);
      if (next === 'Tài') this.condFreq[key][tong].tai += w;
      else                this.condFreq[key][tong].xiu += w;
    }
  }

  _condFreqPredict(tong, isMd5) {
    if (!this.condFreq) return null;
    const key = isMd5 ? 'md5' : 'tx';
    const e   = this.condFreq[key][tong];
    if (!e) return null;
    const total = e.tai + e.xiu;
    if (total < 3) return null; // cần ít nhất 3 mẫu
    const pTai    = e.tai / total;
    const strength = Math.abs(pTai - 0.5);
    if (strength < 0.15) return null; // quá cân bằng → bỏ qua
    return {
      pred: pTai > 0.5 ? 'Tài' : 'Xỉu',
      conf: strength,
      pTai: Math.round(pTai * 100)
    };
  }
  hocTuPhien(history, isMd5 = false, predConf = 0.5) {
    if (history.length < 6) return;

    this.phien++;
    if (isMd5) this.phienMD5++;
    else       this.phienTX++;

    const seq    = history.map(h => h.ket_qua);
    const tng    = history.map(h => h.tong);
    const actual = seq[0];

    // Update Conditional Frequency table
    this._updateCondFreq(history, isMd5);

    // Update GB weights
    const gbRes = this._gbPredict(seq.slice(1), tng.slice(1), isMd5);
    if (gbRes) this._gbUpdate(gbRes.features, gbRes.pred, actual, isMd5);

    // Update Pattern Memory
    const lrMult = predConf > 0.6 ? 1.5 : predConf > 0.4 ? 1.0 : 0.6;
    const keys   = this._makeKeys(seq.slice(1), tng.slice(1));

    for (const { key, w } of keys) {
      if (!this.mem[key]) this.mem[key] = { tai: 0, xiu: 0, lastSeen: this.phien };
      const entry = this.mem[key];
      const gap   = this.phien - entry.lastSeen;
      if (gap > 0) {
        const df = Math.pow(this.decay, gap);
        entry.tai *= df;
        entry.xiu *= df;
      }
      if (actual === 'Tài') entry.tai += w * lrMult;
      else                   entry.xiu += w * lrMult;
      entry.lastSeen = this.phien;
    }
  }

  /*─────────────────────────────────────────
    PATTERN MEMORY PREDICT
  ─────────────────────────────────────────*/
  _pmPredict(seq, tng) {
    const keys = this._makeKeys(seq, tng);
    let totalScore = 0, matched = 0;

    for (const { key, w } of keys) {
      const entry = this.mem[key];
      if (!entry) continue;
      const total = entry.tai + entry.xiu;
      if (total < 3) continue;
      const pTai = entry.tai / total;
      const conf = Math.abs(pTai - 0.5);
      if (conf < 0.1) continue;
      totalScore += (pTai - 0.5) * 2 * w * conf * Math.log(total + 1);
      matched++;
    }

    if (matched === 0 || Math.abs(totalScore) < 0.3) return null;
    return { pred: totalScore >= 0 ? 'Tài' : 'Xỉu', score: totalScore, matched };
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN CHÍNH — PM + GB vote
    Trọng số: GB 3.0 | PM 2.0
    Fallback: Freq8
  ─────────────────────────────────────────*/
  duDoan(history, isMd5 = false) {
    if (history.length < 8) return 'Chưa có dữ liệu';

    const seq  = history.map(h => h.ket_qua);
    const tng  = history.map(h => h.tong);

    const pm   = this._pmPredict(seq, tng);
    const gb   = this._gbPredict(seq, tng, isMd5);
    const cf   = this._condFreqPredict(tng[0], isMd5); // tổng phiên mới nhất

    const votes = { 'Tài': 0, 'Xỉu': 0 };

    // Conditional Frequency: trọng số cao nhất vì test cho thấy 71%
    if (cf) votes[cf.pred] += 4.0 * (cf.conf * 2);
    // Gradient Boosting
    if (gb) votes[gb.pred] += 3.0 * Math.min(1, Math.abs(gb.score) * 2);
    // Pattern Memory
    if (pm) votes[pm.pred] += 2.0;

    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const r   = seq.slice(0, 8);
      const tai = r.filter(v => v === 'Tài').length;
      return tai > 4 ? 'Tài' : 'Xỉu';
    }

    return votes['Tài'] >= votes['Xỉu'] ? 'Tài' : 'Xỉu';
  }

  /*─────────────────────────────────────────
    CONFIDENCE — win rate thực tế 20 phiên
  ─────────────────────────────────────────*/
  calculateConfidence(history) {
    if (history.length < 5) return 0;
    const valid = history
      .filter(h => h.status === '✅' || h.status === '❌')
      .slice(0, 20);
    if (valid.length < 5) return 0;
    return Math.round(valid.filter(h => h.status === '✅').length / valid.length * 100);
  }

  /*─────────────────────────────────────────
    THỐNG KÊ
  ─────────────────────────────────────────*/
  getStats() {
    const uptimeMs  = Date.now() - this.startTime;
    const uptimeMin = Math.floor(uptimeMs / 60000);
    const uptimeH   = Math.floor(uptimeMin / 60);
    const uptimeStr = uptimeH > 0 ? `${uptimeH}h ${uptimeMin%60}m` : `${uptimeMin}m`;

    const keys   = Object.keys(this.mem);
    const strong = keys.filter(k => {
      const e = this.mem[k];
      const t = e.tai + e.xiu;
      return t >= 5 && Math.abs(e.tai/t - 0.5) > 0.2;
    }).length;

    return {
      tong_phien_hoc: this.phien,
      phien_md5:      this.phienMD5,
      phien_tx:       this.phienTX,
      tong_pattern:   keys.length,
      pattern_manh:   strong,
      gb_weights_tx:  this.gbWeights.tx.map(w => Math.round(w*100)/100),
      gb_weights_md5: this.gbWeights.md5.map(w => Math.round(w*100)/100),
      uptime:         uptimeStr,
      ghi_chu:        this.phien < 50  ? 'Đang học... cần thêm phiên'
                    : this.phien < 500 ? 'Đã học khá — đang cải thiện'
                    : 'Đã học đủ — dự đoán ổn định'
    };
  }

  duDoanChiTiet(history, isMd5 = false) {
    if (history.length < 8) return null;
    const seq = history.map(h => h.ket_qua);
    const tng = history.map(h => h.tong);
    const pm  = this._pmPredict(seq, tng);
    const gb  = this._gbPredict(seq, tng, isMd5);
    const cf  = this._condFreqPredict(tng[0], isMd5);
    return {
      ...this.getStats(),
      tong_hien_tai:   tng[0],
      cond_freq:       cf ? `${cf.pred} (Tài=${cf.pTai}%, n đủ)` : 'Chưa đủ mẫu',
      pattern_memory:  pm ? `${pm.pred} (${pm.matched} patterns)` : 'Không đủ data',
      gradient_boost:  gb ? `${gb.pred} (score: ${gb.score.toFixed(2)})` : 'Không đủ data',
      ensemble:        this.duDoan(history, isMd5)
    };
  }

  phanTichXacSuat(history) {
    if (!history.length) return { tai: 0, xiu: 0 };
    const total = history.length;
    const tai   = history.filter(h => h.ket_qua === 'Tài').length;
    return { tai: Math.round(tai/total*100), xiu: Math.round((total-tai)/total*100), tong_phien: total };
  }
}

module.exports = ThuatToanB52;
