class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    TÁCH CẦU — trả về mảng các cầu liên tiếp
    VD: [T,T,T,X,X,T,X,X,X] → [{val:T,len:3},{val:X,len:2},{val:T,len:1},{val:X,len:3}]
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
    THỐNG KÊ GÃY CẦU — học từ lịch sử 50 phiên
    Với mỗi độ dài cầu L, tính:
    - Tỉ lệ gãy sau L phiên (breakRate)
    - Tỉ lệ tiếp tục sau L phiên (continueRate)
    Đây là "bộ nhớ" học từ bàn cụ thể này.
  ─────────────────────────────────────────*/
  _breakStats(caus) {
    // stats[L] = { broke: số lần gãy tại độ dài L, continued: số lần tiếp tục }
    const stats = {};

    for (let i = 0; i < caus.length - 1; i++) {
      const L    = caus[i].len;
      const next = caus[i + 1]; // cầu kế tiếp

      if (!stats[L]) stats[L] = { broke: 0, continued: 0, total: 0 };

      // Gãy = cầu kế tiếp là cầu khác
      // Thực ra caus[i] và caus[i+1] luôn khác val
      // Nên ta xem: sau khi cầu dài L kết thúc, cầu tiếp ngắn hay dài?
      stats[L].broke++;
      stats[L].total++;

      // Thêm thống kê: tại L-1 (phiên trước khi gãy) — vẫn tiếp tục
      for (let sub = 1; sub < L; sub++) {
        if (!stats[sub]) stats[sub] = { broke: 0, continued: 0, total: 0 };
        stats[sub].continued++;
        stats[sub].total++;
      }
    }

    return stats;
  }

  /*─────────────────────────────────────────
    XÁC SUẤT GÃY TẠI ĐỘ DÀI HIỆN TẠI
    Dựa trên lịch sử: cầu dài L này đã gãy bao nhiêu lần?
    Interpolate nếu không có đủ data.
  ─────────────────────────────────────────*/
  _breakProbability(stats, currentLen) {
    // Tìm xác suất gãy tại currentLen
    const entry = stats[currentLen];
    if (entry && entry.total >= 3) {
      return entry.broke / entry.total;
    }

    // Không đủ data → nội suy từ các độ dài lân cận
    const keys = Object.keys(stats).map(Number).sort((a, b) => a - b);
    if (!keys.length) return 0.5;

    // Tìm 2 điểm gần nhất để nội suy
    const below = keys.filter(k => k <= currentLen).pop();
    const above = keys.filter(k => k > currentLen)[0];

    if (below !== undefined && above !== undefined) {
      const pBelow = stats[below].broke / stats[below].total;
      const pAbove = stats[above].broke / stats[above].total;
      const t = (currentLen - below) / (above - below);
      return pBelow + t * (pAbove - pBelow);
    }

    if (below !== undefined) return stats[below].broke / stats[below].total;
    if (above !== undefined) return stats[above].broke / stats[above].total;

    return 0.5;
  }

  /*─────────────────────────────────────────
    NHẬN DIỆN DẠNG CẦU HIỆN TẠI
  ─────────────────────────────────────────*/
  _cauType(caus) {
    if (caus.length < 3) return 'unknown';
    const avg      = caus.reduce((s, c) => s + c.len, 0) / caus.length;
    const short    = caus.filter(c => c.len === 1).length / caus.length;
    if (short >= 0.6)  return 'zigzag';
    if (avg >= 2.8)    return 'bet';
    if (avg >= 1.8)    return 'mixed_long';
    return 'mixed_short';
  }

  /*─────────────────────────────────────────
    PHÂN TÍCH XU HƯỚNG GÃY GẦN ĐÂY
    Nhìn 8 cầu gần nhất xem gãy nhanh hay chậm
  ─────────────────────────────────────────*/
  _recentTrend(caus) {
    if (caus.length < 4) return 'unknown';
    const recent = caus.slice(0, Math.min(8, caus.length));
    const avg    = recent.reduce((s, c) => s + c.len, 0) / recent.length;
    const allAvg = caus.reduce((s, c) => s + c.len, 0) / caus.length;

    // Xu hướng gần đây so với toàn bộ
    if (avg > allAvg * 1.3)  return 'lengthening'; // cầu đang dài ra
    if (avg < allAvg * 0.7)  return 'shortening';  // cầu đang ngắn lại
    return 'stable';
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN ĐIỂM GÃY — lõi thuật toán
  ─────────────────────────────────────────*/
  _cauBreakPredict(seq) {
    if (seq.length < 10) return null;

    const caus       = this._splitCau(seq);
    const stats      = this._breakStats(caus);
    const current    = caus[0];
    const type       = this._cauType(caus);
    const trend      = this._recentTrend(caus);
    const opposite   = current.val === 'Tài' ? 'Xỉu' : 'Tài';

    // Xác suất gãy từ lịch sử bàn này
    const pBreak = this._breakProbability(stats, current.len);

    const score = { 'Tài': 0, 'Xỉu': 0 };

    // ── Layer 1: Xác suất gãy thống kê ──
    score[opposite]     += pBreak * 4.0;
    score[current.val]  += (1 - pBreak) * 4.0;

    // ── Layer 2: Điều chỉnh theo dạng cầu ──
    if (type === 'zigzag') {
      // Cầu zigzag → luôn đảo chiều
      score[opposite] += 2.5;
    } else if (type === 'bet') {
      // Cầu bệt → phụ thuộc vào thống kê gãy
      const maxLen = Math.max(...caus.map(c => c.len));
      if (current.len >= maxLen) score[opposite] += 2.0;     // vượt max → gần chắc gãy
    } else if (type === 'mixed_long') {
      // Hỗn hợp dài → theo thống kê
      if (pBreak > 0.6) score[opposite] += 1.5;
      else score[current.val] += 1.0;
    } else {
      // Mixed short → cầu ngắn, xen kẽ nhanh
      score[opposite] += 1.0;
    }

    // ── Layer 3: Xu hướng gần đây ──
    if (trend === 'lengthening') {
      // Cầu đang có xu hướng dài ra → cầu hiện tại có thể tiếp tục thêm
      score[current.val] += 1.2;
    } else if (trend === 'shortening') {
      // Cầu đang ngắn lại → dễ gãy hơn
      score[opposite] += 1.2;
    }

    // ── Layer 4: So sánh với cầu cùng loại trước đó ──
    // Tìm các cầu cùng val trong lịch sử, xem sau đó bao lâu thì gãy
    {
      const sameVal = caus.slice(1).filter(c => c.val === current.val);
      if (sameVal.length >= 3) {
        const avgSame = sameVal.reduce((s, c) => s + c.len, 0) / sameVal.length;
        if (current.len >= avgSame * 1.2) score[opposite]    += 1.5;
        else if (current.len < avgSame * 0.8) score[current.val] += 1.0;
      }
    }

    // ── Layer 5: Pattern sau gãy ──
    // Sau mỗi lần gãy, cầu mới thường ngắn hay dài?
    {
      if (caus.length >= 3) {
        const afterBreakLens = caus.slice(1).map(c => c.len);
        const avgAfter = afterBreakLens.reduce((s, v) => s + v, 0) / afterBreakLens.length;
        // Nếu sau gãy thường ra cầu ngắn và current đang ngắn → tiếp tục
        if (avgAfter <= 1.5 && current.len <= 2) score[current.val] += 0.8;
      }
    }

    const total = score['Tài'] + score['Xỉu'];
    if (total === 0) return null;
    const pTai = score['Tài'] / total;

    return {
      result:     pTai >= 0.5 ? 'Tài' : 'Xỉu',
      conf:       Math.max(pTai, 1 - pTai),
      pBreak:     Math.round(pBreak * 100),
      cauType:    type,
      trend,
      currentLen: current.len
    };
  }

  /*─────────────────────────────────────────
    MARKOV CHAIN — bậc 1, 2, 3
    Giữ lại nhưng trọng số thấp hơn
  ─────────────────────────────────────────*/
  _markovPredict(seq) {
    if (seq.length < 4) return null;
    const scores = { 'Tài': 0, 'Xỉu': 0 };

    for (const order of [1, 2, 3]) {
      if (seq.length < order + 2) continue;
      const trans = {};
      for (let i = order; i < seq.length; i++) {
        const key = seq.slice(i - order, i).join('|');
        if (!trans[key]) trans[key] = { 'Tài': 0, 'Xỉu': 0, total: 0 };
        trans[key][seq[i]]++;
        trans[key].total++;
      }
      const entry = trans[seq.slice(0, order).join('|')];
      if (!entry || entry.total < 2) continue;
      scores['Tài']  += (entry['Tài']  / entry.total) * order;
      scores['Xỉu'] += (entry['Xỉu'] / entry.total) * order;
    }

    const total = scores['Tài'] + scores['Xỉu'];
    if (total === 0) return null;
    const pTai = scores['Tài'] / total;
    return { result: pTai >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    PATTERN MATCHING — bậc 2, 3, 4
  ─────────────────────────────────────────*/
  _patternPredict(seq) {
    if (seq.length < 5) return null;
    const scores = { 'Tài': 0, 'Xỉu': 0 };

    for (const depth of [2, 3, 4]) {
      if (seq.length < depth + 1) continue;
      const pattern = seq.slice(0, depth).join('|');
      let tai = 0, xiu = 0, matched = 0;
      for (let i = depth; i < seq.length; i++) {
        if (seq.slice(i - depth, i).join('|') === pattern) {
          matched++;
          seq[i] === 'Tài' ? tai++ : xiu++;
        }
      }
      if (matched >= 2) {
        scores['Tài']  += (tai  / matched) * depth;
        scores['Xỉu'] += (xiu / matched) * depth;
      }
    }

    const total = scores['Tài'] + scores['Xỉu'];
    if (total === 0) return null;
    const pTai = scores['Tài'] / total;
    return { result: pTai >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    ENSEMBLE
    Cầu gãy: 6.0 (chủ lực)
    Markov:  2.0
    Pattern: 1.5
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 5) return 'Chưa có dữ liệu';

    const seq     = history.map(h => h.ket_qua);
    const cau     = this._cauBreakPredict(seq);
    const markov  = this._markovPredict(seq);
    const pattern = this._patternPredict(seq);

    const votes = { 'Tài': 0, 'Xỉu': 0 };

    if (cau)     votes[cau.result]     += 6.0 * cau.conf;
    if (markov)  votes[markov.result]  += 2.0 * markov.conf;
    if (pattern) votes[pattern.result] += 1.5 * pattern.conf;

    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const tai = seq.filter(v => v === 'Tài').length;
      return tai >= seq.length / 2 ? 'Tài' : 'Xỉu';
    }

    return votes['Tài'] >= votes['Xỉu'] ? 'Tài' : 'Xỉu';
  }

  /*─────────────────────────────────────────
    CONFIDENCE — back-test 20 phiên
  ─────────────────────────────────────────*/
  calculateConfidence(history, prediction, last_n = 20) {
    if (history.length < 6) return 0;
    const recent = history.slice(0, last_n);
    let correct = 0, total = 0;

    for (let i = 0; i < recent.length - 1; i++) {
      const predicted = this.duDoan(history.slice(i));
      if (predicted !== 'Chưa có dữ liệu' && predicted === recent[i + 1].ket_qua) correct++;
      total++;
    }

    return total > 0 ? Math.round((correct / total) * 100) : 0;
  }

  duDoanChiTiet(history) {
    if (history.length < 5) return null;
    const seq  = history.map(h => h.ket_qua);
    const cau  = this._cauBreakPredict(seq);
    const m    = this._markovPredict(seq);
    const p    = this._patternPredict(seq);

    return {
      cau_type:   cau ? cau.cauType    : 'N/A',
      cau_len:    cau ? cau.currentLen : 0,
      cau_trend:  cau ? cau.trend      : 'N/A',
      p_break:    cau ? `${cau.pBreak}%` : 'N/A',
      cau_pred:   cau ? `${cau.result} (${Math.round(cau.conf * 100)}%)` : 'N/A',
      markov:     m   ? `${m.result} (${Math.round(m.conf * 100)}%)`    : 'N/A',
      pattern:    p   ? `${p.result} (${Math.round(p.conf * 100)}%)`    : 'N/A',
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
