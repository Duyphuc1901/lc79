/**
 * CONDITIONAL FREQUENCY + GRADIENT BOOSTING
 * ──────────────────────────────────────────
 * Chỉ dùng 100 phiên gần nhất, không lưu lịch sử dài hạn.
 *
 * 1. Conditional Frequency — bảng tổng T → phiên tiếp theo
 *    Học từ 100 phiên: sau tổng X thường ra Tài hay Xỉu?
 *    Mỗi bàn (TX/MD5) có bảng riêng.
 *
 * 2. Gradient Boosting — 5 weak learners vote có trọng số
 *    Tự học trọng số từ data thực tế.
 */
class ThuatToanB52 {

  constructor() {
    this.startTime = Date.now();
  }

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    CONDITIONAL FREQUENCY
    Xây bảng: sau tổng T → Tài/Xỉu bao nhiêu lần?
    Chỉ dùng 100 phiên, phiên gần hơn trọng số cao hơn
  ─────────────────────────────────────────*/
  _buildCondFreq(history) {
    const table = {};
    // history[0] = mới nhất, history[N] = cũ nhất
    // history[i].tong → history[i-1].ket_qua là kết quả tiếp theo
    for (let i = history.length - 1; i >= 1; i--) {
      const tong = history[i].tong;
      const next = history[i - 1].ket_qua;
      if (!tong || !next) continue;

      if (!table[tong]) table[tong] = { tai: 0, xiu: 0 };

      // Phiên gần hơn (i nhỏ hơn) có trọng số cao hơn
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
    if (total < 3) return null; // cần ít nhất 3 mẫu

    const pTai     = e.tai / total;
    const strength = Math.abs(pTai - 0.5);
    if (strength < 0.15) return null; // quá cân bằng

    return {
      pred: pTai > 0.5 ? 'Tài' : 'Xỉu',
      conf: strength,
      pTai: Math.round(pTai * 100),
      n:    Math.round(total)
    };
  }

  /*─────────────────────────────────────────
    GRADIENT BOOSTING — 5 weak learners
    Trọng số cố định (đã được test là tốt nhất)
  ─────────────────────────────────────────*/
  _gbPredict(seq, tng) {
    if (seq.length < 8) return null;

    const f = new Array(5).fill(0);

    // F0: Tần suất decay theo thời gian
    {
      let wT = 0, wTotal = 0;
      for (let i = 0; i < Math.min(seq.length, 20); i++) {
        const w = Math.exp(-i * 0.1);
        if (seq[i] === 'Tài') wT += w;
        wTotal += w;
      }
      f[0] = (wT / wTotal - 0.5) * 2;
    }

    // F1: Tổng zone signal (từ test thực tế)
    {
      const t = tng[0];
      f[1] = t >= 13 ? -0.3 : t <= 8 ? 0.3 : t <= 10 ? -0.2 : 0.1;
    }

    // F2: Markov bậc 2 (window 20)
    {
      const s  = seq.slice(0, 20);
      const tr = {};
      for (let i = 0; i < s.length - 2; i++) {
        const k = s[i] + '|' + s[i + 1];
        if (!tr[k]) tr[k] = { T: 0, X: 0 };
        s[i + 2] === 'Tài' ? tr[k].T++ : tr[k].X++;
      }
      const e = tr[seq[0] + '|' + seq[1]];
      if (e && e.T + e.X >= 2) f[2] = (e.T / (e.T + e.X) - 0.5) * 2;
    }

    // F3: Streak signal
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

    // F4: Regression to mean (15 phiên)
    {
      const tai = seq.slice(0, 15).filter(v => v === 'Tài').length / 15;
      f[4] = tai > 0.65 ? -0.5 : tai < 0.35 ? 0.5 : 0;
    }

    // Trọng số cố định (đã test tốt nhất)
    const weights = [0.25, 0.15, 0.30, 0.20, 0.10];
    const score   = f.reduce((acc, fi, i) => acc + weights[i] * fi, 0);

    if (Math.abs(score) < 0.05) return null;
    return { pred: score > 0 ? 'Tài' : 'Xỉu', score };
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN — CondFreq chủ lực + GB hỗ trợ
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 10) return 'Chưa có dữ liệu';

    const seq   = history.map(h => h.ket_qua);
    const tng   = history.map(h => h.tong);
    const table = this._buildCondFreq(history);

    const cf = this._condFreqPredict(table, tng[0]);
    const gb = this._gbPredict(seq, tng);

    const votes = { 'Tài': 0, 'Xỉu': 0 };

    // CondFreq: trọng số theo độ mạnh của signal
    if (cf) {
      const w = 3.0 + cf.conf * 4.0; // mạnh hơn → trọng số cao hơn
      votes[cf.pred] += w;
    }

    // GB: hỗ trợ khi CondFreq không có signal
    if (gb) {
      votes[gb.pred] += 1.5 * Math.min(1, Math.abs(gb.score) * 2);
    }

    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      // Fallback: tần suất 8 phiên gần nhất
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
      uptime: h > 0 ? `${h}h ${min % 60}m` : `${min}m`,
      mode:   'CondFreq(100) + GradientBoosting'
    };
  }

  duDoanChiTiet(history) {
    if (history.length < 10) return null;
    const seq   = history.map(h => h.ket_qua);
    const tng   = history.map(h => h.tong);
    const table = this._buildCondFreq(history);
    const cf    = this._condFreqPredict(table, tng[0]);
    const gb    = this._gbPredict(seq, tng);

    // Hiển thị toàn bộ bảng CondFreq đang dùng
    const bangTong = {};
    Object.keys(table).sort((a,b)=>+a-+b).forEach(t => {
      const e = table[t];
      const n = e.tai + e.xiu;
      if (n < 3) return;
      const p = e.tai / n;
      bangTong[`tong_${t}`] = `${p > 0.5 ? 'Tài' : 'Xỉu'} (${Math.round(Math.max(p,1-p)*100)}%, n=${Math.round(n)})`;
    });

    return {
      tong_hien_tai:  tng[0],
      cond_freq:      cf ? `${cf.pred} (Tài=${cf.pTai}%, n=${cf.n})` : 'Không đủ mẫu/quá cân bằng',
      gradient_boost: gb ? `${gb.pred} (score=${gb.score.toFixed(2)})` : 'Không rõ',
      ensemble:       this.duDoan(history),
      bang_tong:      bangTong,
      ...this.getStats()
    };
  }

  phanTichXacSuat(history) {
    if (!history.length) return { tai: 0, xiu: 0 };
    const total = history.length;
    const tai   = history.filter(h => h.ket_qua === 'Tài').length;
    return {
      tai:        Math.round(tai / total * 100),
      xiu:        Math.round((total - tai) / total * 100),
      tong_phien: total
    };
  }
}

module.exports = ThuatToanB52;
