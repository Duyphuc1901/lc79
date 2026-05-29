/**
 * ENSEMBLE: Cầu DB + Conditional Frequency + Gradient Boosting
 * ─────────────────────────────────────────────────────────────
 * 3 engine kết hợp:
 * 1. CauDB     — lookup 10000 mẫu cầu từ file cau.txt
 * 2. CondFreq  — xác suất tổng T → phiên tiếp theo (từ 100 phiên)
 * 3. GB        — 5 weak learners tự học trọng số
 */
class ThuatToanB52 {

  constructor() {
    this.cauDB     = []; // sẽ được load từ bên ngoài
    this.startTime = Date.now();
  }

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    LOAD CẦU DB từ file cau.txt
    Gọi một lần khi khởi động server
  ─────────────────────────────────────────*/
  loadCauDB(fileContent) {
    const lines = fileContent.trim().split('\n');
    this.cauDB = lines.map(line => {
      const m = line.match(/\d+\.\s+([TX]+)\s+-\s+([TX])/);
      if (!m) return null;
      return { pat: m[1], res: m[2] === 'T' ? 'Tài' : 'Xỉu' };
    }).filter(Boolean);
    console.log(`[CauDB] Đã load ${this.cauDB.length} mẫu cầu`);
  }

  /*─────────────────────────────────────────
    CẦU DB PREDICT
    Dùng 14 phiên gần nhất để tra bảng cầu
    Thử khớp từ 14 → 12 ký tự
  ─────────────────────────────────────────*/
  _cauDBPredict(seq) {
    if (!this.cauDB.length || seq.length < 12) return null;

    // Encode seq thành chuỗi T/X
    const encoded = seq.slice(0, 14).map(v => v === 'Tài' ? 'T' : 'X').join('');

    // Thử khớp từ dài → ngắn
    for (const len of [14, 13, 12]) {
      if (encoded.length < len) continue;
      const pat = encoded.slice(0, len);

      // Tìm tất cả pattern khớp phần cuối
      const matches = this.cauDB.filter(c =>
        c.pat.length >= len && c.pat.slice(c.pat.length - len) === pat ||
        c.pat.slice(0, len) === pat
      );

      if (matches.length < 3) continue;

      const tai  = matches.filter(c => c.res === 'Tài').length;
      const xiu  = matches.length - tai;
      const conf = Math.abs(tai - xiu) / matches.length;

      if (conf < 0.15) continue; // quá cân bằng

      return {
        pred:    tai > xiu ? 'Tài' : 'Xỉu',
        conf,
        matches: matches.length,
        len
      };
    }

    return null;
  }

  /*─────────────────────────────────────────
    CONDITIONAL FREQUENCY
    Bảng tổng T → phiên tiếp theo từ 100 phiên
  ─────────────────────────────────────────*/
  _buildCondFreq(history) {
    const table = {};
    for (let i = history.length - 1; i >= 1; i--) {
      const tong = history[i].tong;
      const next = history[i - 1].ket_qua;
      if (!tong || !next) continue;
      if (!table[tong]) table[tong] = { tai: 0, xiu: 0 };
      const w = 1 + (history.length - i) / history.length;
      if (next === 'Tài') table[tong].tai += w;
      else                 table[tong].xiu += w;
    }
    return table;
  }

  _condFreqPredict(table, currentTong) {
    const e = table[currentTong];
    if (!e) return null;
    const total    = e.tai + e.xiu;
    if (total < 3) return null;
    const pTai     = e.tai / total;
    const strength = Math.abs(pTai - 0.5);
    if (strength < 0.15) return null;
    return {
      pred: pTai > 0.5 ? 'Tài' : 'Xỉu',
      conf: strength,
      pTai: Math.round(pTai * 100)
    };
  }

  /*─────────────────────────────────────────
    GRADIENT BOOSTING — 5 weak learners
  ─────────────────────────────────────────*/
  _gbPredict(seq, tng) {
    if (seq.length < 8) return null;
    const f = new Array(5).fill(0);

    // F0: Tần suất decay
    {
      let wT = 0, wTotal = 0;
      for (let i = 0; i < Math.min(seq.length, 20); i++) {
        const w = Math.exp(-i * 0.1);
        if (seq[i] === 'Tài') wT += w;
        wTotal += w;
      }
      f[0] = (wT / wTotal - 0.5) * 2;
    }

    // F1: Tổng zone
    {
      const t = tng[0];
      f[1] = t >= 13 ? -0.3 : t <= 8 ? 0.3 : t <= 10 ? -0.2 : 0.1;
    }

    // F2: Markov bậc 2
    {
      const s = seq.slice(0, 20), tr = {};
      for (let i = 0; i < s.length - 2; i++) {
        const k = s[i] + '|' + s[i + 1];
        if (!tr[k]) tr[k] = { T: 0, X: 0 };
        s[i + 2] === 'Tài' ? tr[k].T++ : tr[k].X++;
      }
      const e = tr[seq[0] + '|' + seq[1]];
      if (e && e.T + e.X >= 2) f[2] = (e.T / (e.T + e.X) - 0.5) * 2;
    }

    // F3: Streak
    {
      let streak = 1;
      for (let i = 1; i < Math.min(seq.length, 7); i++) {
        if (seq[i] === seq[0]) streak++;
        else break;
      }
      if      (streak >= 5) f[3] = seq[0] === 'Tài' ? -0.9 : 0.9;
      else if (streak >= 3) f[3] = seq[0] === 'Tài' ? -0.5 : 0.5;
      else if (streak >= 2) f[3] = seq[0] === 'Tài' ?  0.3 : -0.3;
    }

    // F4: Regression to mean
    {
      const tai = seq.slice(0, 15).filter(v => v === 'Tài').length / 15;
      f[4] = tai > 0.65 ? -0.5 : tai < 0.35 ? 0.5 : 0;
    }

    const weights = [0.25, 0.15, 0.30, 0.20, 0.10];
    const score   = f.reduce((acc, fi, i) => acc + weights[i] * fi, 0);
    if (Math.abs(score) < 0.05) return null;
    return { pred: score > 0 ? 'Tài' : 'Xỉu', score };
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN CHÍNH — Weighted Ensemble
    Trọng số: CauDB 4.0 | CondFreq 3.5 | GB 1.5
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 10) return 'Chưa có dữ liệu';

    const seq   = history.map(h => h.ket_qua);
    const tng   = history.map(h => h.tong);
    const table = this._buildCondFreq(history);

    const caudb = this._cauDBPredict(seq);
    const cf    = this._condFreqPredict(table, tng[0]);
    const gb    = this._gbPredict(seq, tng);

    const votes = { 'Tài': 0, 'Xỉu': 0 };

    // CauDB — trọng số cao nhất khi conf cao
    if (caudb) {
      const w = 4.0 * (0.5 + caudb.conf);
      votes[caudb.pred] += w;
    }

    // CondFreq — trọng số theo độ mạnh signal
    if (cf) {
      const w = 3.5 + cf.conf * 3.0;
      votes[cf.pred] += w;
    }

    // GB — hỗ trợ
    if (gb) {
      votes[gb.pred] += 1.5 * Math.min(1, Math.abs(gb.score) * 2);
    }

    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const tai = seq.slice(0, 8).filter(v => v === 'Tài').length;
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
    const ms  = Date.now() - this.startTime;
    const min = Math.floor(ms / 60000);
    const h   = Math.floor(min / 60);
    return {
      uptime:     h > 0 ? `${h}h ${min % 60}m` : `${min}m`,
      mode:       'CauDB + CondFreq(100) + GradientBoosting',
      cau_loaded: this.cauDB.length
    };
  }

  duDoanChiTiet(history) {
    if (history.length < 10) return null;
    const seq   = history.map(h => h.ket_qua);
    const tng   = history.map(h => h.tong);
    const table = this._buildCondFreq(history);
    const caudb = this._cauDBPredict(seq);
    const cf    = this._condFreqPredict(table, tng[0]);
    const gb    = this._gbPredict(seq, tng);

    const bangTong = {};
    Object.keys(table).sort((a,b)=>+a-+b).forEach(t => {
      const e = table[t], n = e.tai + e.xiu;
      if (n < 3) return;
      const p = e.tai / n;
      bangTong[`tong_${t}`] = `${p > 0.5 ? 'Tài' : 'Xỉu'} (${Math.round(Math.max(p,1-p)*100)}%, n=${Math.round(n)})`;
    });

    return {
      tong_hien_tai:  tng[0],
      cau_db:         caudb ? `${caudb.pred} (${Math.round(caudb.conf*100)}%, ${caudb.matches} khớp, bậc ${caudb.len})` : 'Không đủ khớp',
      cond_freq:      cf    ? `${cf.pred} (Tài=${cf.pTai}%)` : 'Không đủ mẫu',
      gradient_boost: gb    ? `${gb.pred} (score=${gb.score.toFixed(2)})` : 'Không rõ',
      ensemble:       this.duDoan(history),
      bang_tong:      bangTong,
      ...this.getStats()
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
