/**
 * BALANCED ENSEMBLE với Anti-Bias
 * ────────────────────────────────
 * 4 thuật toán độc lập, mỗi cái có trọng số động.
 * Cơ chế anti-bias: phát hiện khi nào một thuật toán
 * đang báo một chiều liên tục → tự giảm trọng số.
 * Kết quả cuối phải được ít nhất 2 thuật toán đồng ý.
 */
class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    ANTI-BIAS WEIGHT
    Nếu một thuật toán báo cùng một chiều liên tục
    trong N phiên gần nhất → giảm trọng số của nó.
    Phòng trường hợp bị "kẹt" như Markov thuần.
  ─────────────────────────────────────────*/
  _antiBiasWeight(predictions, baseWeight) {
    // predictions: mảng kết quả gần nhất của thuật toán này
    if (!predictions || predictions.length < 5) return baseWeight;

    const recent = predictions.slice(0, 8);
    const tai    = recent.filter(v => v === 'Tài').length;
    const xiu    = recent.length - tai;
    const maxOne = Math.max(tai, xiu);
    const ratio  = maxOne / recent.length;

    // Nếu báo 1 chiều > 87% → giảm mạnh
    if (ratio >= 0.875) return baseWeight * 0.2;
    // Báo 1 chiều > 75% → giảm vừa
    if (ratio >= 0.75)  return baseWeight * 0.5;
    // Báo 1 chiều > 62% → giảm nhẹ
    if (ratio >= 0.625) return baseWeight * 0.75;

    return baseWeight;
  }

  /*─────────────────────────────────────────
    TÁCH CẦU
  ─────────────────────────────────────────*/
  _splitCau(seq) {
    if (!seq.length) return [];
    const caus = [];
    let cur = seq[0], len = 1;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === cur) len++;
      else { caus.push({ val: cur, len }); cur = seq[i]; len = 1; }
    }
    caus.push({ val: cur, len });
    return caus;
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 1: MARKOV bậc 1-3
    Dùng window ngắn (20 phiên) để tránh bias dài hạn.
  ─────────────────────────────────────────*/
  _markov(seq) {
    // Chỉ dùng 20 phiên gần nhất — tránh bias từ lịch sử cũ
    const s = seq.slice(0, 20);
    if (s.length < 4) return null;

    const scores = { 'Tài': 0, 'Xỉu': 0 };
    let   hasData = false;

    for (const order of [1, 2, 3]) {
      if (s.length < order + 3) continue;
      const trans = {};

      for (let i = order; i < s.length; i++) {
        const key = s.slice(i - order, i).join('');
        if (!trans[key]) trans[key] = { 'Tài': 0, 'Xỉu': 0, total: 0 };
        trans[key][s[i]]++;
        trans[key].total++;
      }

      const key   = s.slice(0, order).join('');
      const entry = trans[key];
      if (!entry || entry.total < 2) continue;

      const pTai = entry['Tài'] / entry.total;
      const pXiu = entry['Xỉu'] / entry.total;

      // Chỉ tính khi có sự chênh lệch rõ ràng
      if (Math.abs(pTai - pXiu) < 0.2) continue;

      scores['Tài']  += pTai * order;
      scores['Xỉu'] += pXiu * order;
      hasData = true;
    }

    if (!hasData) return null;
    const total = scores['Tài'] + scores['Xỉu'];
    const pTai  = scores['Tài'] / total;
    if (Math.abs(pTai - 0.5) < 0.1) return null; // quá cân bằng
    return { result: pTai > 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 2: PATTERN MATCHING
    Tìm chuỗi 3-4 phiên giống hiện tại trong lịch sử.
    Chỉ tin khi khớp >= 3 lần và tỉ lệ > 60%.
  ─────────────────────────────────────────*/
  _pattern(seq) {
    if (seq.length < 8) return null;
    const scores = { 'Tài': 0, 'Xỉu': 0 };
    let   hasData = false;

    for (const depth of [3, 4]) {
      if (seq.length < depth + 2) continue;
      const pattern = seq.slice(0, depth).join('');
      let tai = 0, xiu = 0, matched = 0;

      for (let i = depth; i < seq.length; i++) {
        if (seq.slice(i - depth, i).join('') === pattern) {
          matched++;
          seq[i] === 'Tài' ? tai++ : xiu++;
        }
      }

      // Cần >= 3 lần khớp và tỉ lệ rõ ràng > 60%
      if (matched < 3) continue;
      const rate = Math.max(tai, xiu) / matched;
      if (rate < 0.6) continue;

      const winner = tai > xiu ? 'Tài' : 'Xỉu';
      scores[winner] += rate * depth;
      hasData = true;
    }

    if (!hasData) return null;
    const total = scores['Tài'] + scores['Xỉu'];
    const pTai  = scores['Tài'] / total;
    return { result: pTai >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 3: CẦU THỐNG KÊ
    Học từ lịch sử gãy cầu của chính bàn này.
    Dùng 30 phiên gần nhất để tính avg cầu.
  ─────────────────────────────────────────*/
  _cauStat(seq) {
    if (seq.length < 10) return null;

    const caus = this._splitCau(seq.slice(0, 30));
    if (caus.length < 4) return null;

    const current  = caus[0];
    const opposite = current.val === 'Tài' ? 'Xỉu' : 'Tài';

    // Thống kê các cầu cùng chiều trong lịch sử
    const sameVal = caus.slice(1).filter(c => c.val === current.val);
    if (sameVal.length < 2) return null;

    const avgLen = sameVal.reduce((s, c) => s + c.len, 0) / sameVal.length;
    const maxLen = Math.max(...sameVal.map(c => c.len));

    // Tỉ lệ gãy tại độ dài hiện tại
    let brokeAtOrBefore = sameVal.filter(c => c.len <= current.len).length;
    const pBreak = brokeAtOrBefore / sameVal.length;

    if (pBreak > 0.7) return { result: opposite, conf: pBreak };
    if (pBreak < 0.3) return { result: current.val, conf: 1 - pBreak };
    return null; // vùng không chắc → bỏ qua
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 4: REGRESSION TO MEAN
    Nếu tỉ lệ Tài/Xỉu trong 15 phiên gần lệch nhiều
    → kỳ vọng về trung bình. Đơn giản nhưng chống bias tốt.
  ─────────────────────────────────────────*/
  _regression(seq) {
    const recent = seq.slice(0, 15);
    if (recent.length < 10) return null;

    const tai   = recent.filter(v => v === 'Tài').length;
    const ratio = tai / recent.length;

    // Chỉ báo khi lệch rõ ràng (> 65% hoặc < 35%)
    if (ratio > 0.65) return { result: 'Xỉu', conf: ratio };
    if (ratio < 0.35) return { result: 'Tài',  conf: 1 - ratio };
    return null;
  }

  /*─────────────────────────────────────────
    ENSEMBLE CÂN BẰNG
    - Mỗi thuật toán có baseWeight riêng
    - Anti-bias tự động giảm weight khi bias
    - Kết quả cuối cần 2+ thuật toán đồng ý
      hoặc 1 thuật toán với weight rất cao
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 8) return 'Chưa có dữ liệu';

    const seq = history.map(h => h.ket_qua);

    // Tính kết quả từng thuật toán
    const markov     = this._markov(seq);
    const pattern    = this._pattern(seq);
    const cauStat    = this._cauStat(seq);
    const regression = this._regression(seq);

    // Base weights
    const baseW = { markov: 2.5, pattern: 2.5, cauStat: 2.5, regression: 2.0 };

    // Lấy 8 dự đoán gần nhất của từng thuật toán để tính anti-bias
    const recentPreds = {
      markov:     history.slice(1, 9).map(h => this._markov(history.slice(history.indexOf(h)).map(x => x.ket_qua))?. result).filter(Boolean),
      pattern:    history.slice(1, 9).map(h => this._pattern(history.slice(history.indexOf(h)).map(x => x.ket_qua))?.result).filter(Boolean),
      cauStat:    history.slice(1, 9).map(h => this._cauStat(history.slice(history.indexOf(h)).map(x => x.ket_qua))?.result).filter(Boolean),
      regression: history.slice(1, 9).map(h => this._regression(history.slice(history.indexOf(h)).map(x => x.ket_qua))?.result).filter(Boolean),
    };

    // Áp anti-bias
    const w = {
      markov:     this._antiBiasWeight(recentPreds.markov,     baseW.markov),
      pattern:    this._antiBiasWeight(recentPreds.pattern,    baseW.pattern),
      cauStat:    this._antiBiasWeight(recentPreds.cauStat,    baseW.cauStat),
      regression: this._antiBiasWeight(recentPreds.regression, baseW.regression),
    };

    const votes = { 'Tài': 0, 'Xỉu': 0 };
    const voters = { 'Tài': 0, 'Xỉu': 0 }; // đếm số thuật toán đồng ý

    const add = (result, conf, weight) => {
      if (!result) return;
      votes[result]  += weight * conf;
      voters[result] += 1;
    };

    add(markov?.result,     markov?.conf     || 0.5, w.markov);
    add(pattern?.result,    pattern?.conf    || 0.5, w.pattern);
    add(cauStat?.result,    cauStat?.conf    || 0.5, w.cauStat);
    add(regression?.result, regression?.conf || 0.5, w.regression);

    // Không có thuật toán nào cho kết quả → fallback tần suất
    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const tai = seq.slice(0, 20).filter(v => v === 'Tài').length;
      return tai > 10 ? 'Tài' : 'Xỉu';
    }

    const winner = votes['Tài'] >= votes['Xỉu'] ? 'Tài' : 'Xỉu';
    const loser  = winner === 'Tài' ? 'Xỉu' : 'Tài';

    // Kiểm tra đồng thuận: winner cần ít nhất 2 thuật toán
    // hoặc khoảng cách điểm đủ lớn (> 2x)
    if (voters[winner] >= 2 || votes[winner] > votes[loser] * 2) {
      return winner;
    }

    // Không đủ đồng thuận → theo regression (chống bias tốt nhất)
    if (regression) return regression.result;

    return winner;
  }

  /*─────────────────────────────────────────
    CONFIDENCE — tỉ lệ thắng 15 phiên gần nhất
  ─────────────────────────────────────────*/
  calculateConfidence(history, prediction, last_n = 15) {
    if (history.length < 8) return 0;
    const recent = history.slice(0, last_n);
    let correct = 0, total = 0;

    for (let i = 0; i < recent.length - 1; i++) {
      const sub = history.slice(i);
      if (sub.length < 8) continue;
      const pred = this.duDoan(sub);
      if (pred !== 'Chưa có dữ liệu' && pred === recent[i + 1].ket_qua) correct++;
      total++;
    }

    return total > 0 ? Math.round((correct / total) * 100) : 0;
  }

  duDoanChiTiet(history) {
    if (history.length < 8) return null;
    const seq = history.map(h => h.ket_qua);
    const m   = this._markov(seq);
    const p   = this._pattern(seq);
    const c   = this._cauStat(seq);
    const r   = this._regression(seq);

    return {
      markov:     m ? `${m.result} (${Math.round(m.conf * 100)}%)` : 'Bỏ qua',
      pattern:    p ? `${p.result} (${Math.round(p.conf * 100)}%)` : 'Bỏ qua',
      cau_stat:   c ? `${c.result} (${Math.round(c.conf * 100)}%)` : 'Bỏ qua',
      regression: r ? `${r.result} (${Math.round(r.conf * 100)}%)` : 'Bỏ qua',
      ensemble:   this.duDoan(history)
    };
  }

  phanTichXacSuat(history) {
    if (!history.length) return { tai: 0, xiu: 0 };
    const total = history.length;
    const tai   = history.filter(h => h.ket_qua === 'Tài').length;
    return {
      tai:        Math.round((tai / total) * 100),
      xiu:        Math.round(((total - tai) / total) * 100),
      tong_phien: total
    };
  }
}

module.exports = ThuatToanB52;
