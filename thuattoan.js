class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    PATTERN MATCHING — đa bậc (2, 3, 4 phiên)
    Tìm chuỗi giống nhau trong toàn bộ 50 phiên,
    tổng hợp xác suất kết quả tiếp theo theo từng bậc.
    Bậc dài hơn → trọng số cao hơn (ít trùng nhưng đáng tin hơn).
  ─────────────────────────────────────────*/
  _patternPredict(seq) {
    if (seq.length < 5) return null;

    const scores = { 'Tài': 0, 'Xỉu': 0 };
    const depths = [2, 3, 4];

    for (const depth of depths) {
      if (seq.length < depth + 1) continue;
      const pattern = seq.slice(0, depth).join('|');
      let tai = 0, xiu = 0, matched = 0;

      for (let i = depth; i < seq.length; i++) {
        const window = seq.slice(i - depth, i).join('|');
        if (window === pattern) {
          matched++;
          if (seq[i] === 'Tài') tai++;
          else xiu++;
        }
      }

      // Cần ít nhất 2 lần khớp để có ý nghĩa thống kê
      if (matched >= 2) {
        const weight = depth;
        scores['Tài']  += (tai  / matched) * weight;
        scores['Xỉu'] += (xiu / matched) * weight;
      }
    }

    const total = scores['Tài'] + scores['Xỉu'];
    if (total === 0) return null;

    const pTai = scores['Tài'] / total;
    // Chỉ dự đoán khi một bên chiếm > 55% — tránh nhiễu
    if (pTai > 0.55) return { result: 'Tài',  conf: pTai };
    if (pTai < 0.45) return { result: 'Xỉu', conf: 1 - pTai };
    return null;
  }

  /*─────────────────────────────────────────
    MARKOV CHAIN — bậc 1, 2, 3
    Xây bảng xác suất chuyển trạng thái từ toàn bộ lịch sử.
    Kết hợp nhiều bậc, bậc cao hơn trọng số cao hơn.
    Cần ít nhất 3 lần xuất hiện mới tính.
  ─────────────────────────────────────────*/
  _markovPredict(seq) {
    if (seq.length < 4) return null;

    const scores = { 'Tài': 0, 'Xỉu': 0 };
    const orders = [1, 2, 3];

    for (const order of orders) {
      if (seq.length < order + 2) continue;
      const trans = {};

      for (let i = order; i < seq.length; i++) {
        const key  = seq.slice(i - order, i).join('|');
        const next = seq[i];
        if (!trans[key]) trans[key] = { 'Tài': 0, 'Xỉu': 0, total: 0 };
        trans[key][next]++;
        trans[key].total++;
      }

      const currentKey = seq.slice(0, order).join('|');
      const entry = trans[currentKey];
      // Cần ít nhất 3 lần xuất hiện để đáng tin
      if (!entry || entry.total < 3) continue;

      const pTai = entry['Tài'] / entry.total;
      const pXiu = entry['Xỉu'] / entry.total;
      const weight = order;

      scores['Tài']  += pTai * weight;
      scores['Xỉu'] += pXiu * weight;
    }

    const total = scores['Tài'] + scores['Xỉu'];
    if (total === 0) return null;

    const pTai = scores['Tài'] / total;
    if (pTai > 0.55) return { result: 'Tài',  conf: pTai };
    if (pTai < 0.45) return { result: 'Xỉu', conf: 1 - pTai };
    return null;
  }

  /*─────────────────────────────────────────
    STREAK GUARD — chống chuỗi thua liên tiếp
    Phát hiện chuỗi dài và điều chỉnh chiều dự đoán.
    Mục tiêu: max chuỗi thua ≤ 3.
  ─────────────────────────────────────────*/
  _streakGuard(seq, baseResult) {
    if (seq.length < 3) return baseResult;

    const cur = seq[0];
    let streak = 1;
    for (let i = 1; i < Math.min(seq.length, 10); i++) {
      if (seq[i] === cur) streak++;
      else break;
    }

    // Chuỗi 6+ → đảo chiều gần như chắc chắn
    if (streak >= 6) return cur === 'Tài' ? 'Xỉu' : 'Tài';

    // Chuỗi 4-5 → ưu tiên đảo chiều nếu thuật toán chính cũng đồng ý
    if (streak >= 4) {
      const opposite = cur === 'Tài' ? 'Xỉu' : 'Tài';
      return baseResult === opposite ? opposite : cur;
    }

    return baseResult;
  }

  /*─────────────────────────────────────────
    ENSEMBLE — tổng hợp Pattern + Markov
    Trọng số: Pattern 3.0 | Markov 2.5
    Fallback: tần suất 20 phiên nếu cả hai không đủ tin
    Kết quả qua Streak Guard trước khi trả về
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 5) return 'Chưa có dữ liệu';

    const seq = history.map(h => h.ket_qua);

    const pattern = this._patternPredict(seq);
    const markov  = this._markovPredict(seq);

    const votes = { 'Tài': 0, 'Xỉu': 0 };

    if (pattern) votes[pattern.result] += 3.0 * pattern.conf;
    if (markov)  votes[markov.result]  += 2.5 * markov.conf;

    let base;
    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      // Fallback: tần suất 20 phiên gần nhất
      const recent = seq.slice(0, 20);
      const tai = recent.filter(v => v === 'Tài').length;
      const xiu = recent.length - tai;
      if (tai === xiu) return 'Không rõ';
      base = tai > xiu ? 'Tài' : 'Xỉu';
    } else {
      base = votes['Tài'] >= votes['Xỉu'] ? 'Tài' : 'Xỉu';
    }

    return this._streakGuard(seq, base);
  }

  /*─────────────────────────────────────────
    CONFIDENCE — back-test trên 20 phiên gần nhất
  ─────────────────────────────────────────*/
  calculateConfidence(history, prediction, last_n = 20) {
    if (history.length < 6) return 0;
    const recent = history.slice(0, last_n);
    let correct = 0, total = 0;

    for (let i = 0; i < recent.length - 1; i++) {
      const predicted = this.duDoan(history.slice(i));
      if (
        predicted !== 'Chưa có dữ liệu' &&
        predicted !== 'Không rõ' &&
        predicted === recent[i + 1].ket_qua
      ) correct++;
      total++;
    }

    return total > 0 ? Math.round((correct / total) * 100) : 0;
  }

  // Chi tiết từng thuật toán (dùng cho /api/detail)
  duDoanChiTiet(history) {
    if (history.length < 5) return null;
    const seq = history.map(h => h.ket_qua);
    const p = this._patternPredict(seq);
    const m = this._markovPredict(seq);
    return {
      pattern:  p ? `${p.result} (${Math.round(p.conf * 100)}%)` : 'Không rõ',
      markov:   m ? `${m.result} (${Math.round(m.conf * 100)}%)` : 'Không rõ',
      ensemble: this.duDoan(history)
    };
  }

  phanTichXacSuat(history) {
    if (!history.length) return { tai: 0, xiu: 0 };
    const total = history.length;
    const tai = history.filter(h => h.ket_qua === 'Tài').length;
    return {
      tai:  Math.round((tai / total) * 100),
      xiu:  Math.round(((total - tai) / total) * 100),
      tong_phien: total
    };
  }
}

module.exports = ThuatToanB52;
