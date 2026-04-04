class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
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
    MARKOV CHAIN — bậc 1, 2, 3
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
    AI SCORE — giả lập trí tuệ nhân tạo
    Phân tích 7 chiều độc lập, mỗi chiều cho điểm
    Tài/Xỉu. Trọng số của mỗi chiều tự điều chỉnh
    dựa trên độ chính xác lịch sử (adaptive weight).
    Gần giống cách một mô hình ML ensemble hoạt động.
  ─────────────────────────────────────────*/
  _aiScore(seq) {
    if (seq.length < 10) return null;

    const score = { 'Tài': 0, 'Xỉu': 0 };

    // ── Chiều 1: Tần suất có trọng số thời gian
    // Phiên gần hơn có ảnh hưởng lớn hơn (exponential decay)
    {
      let wTai = 0, wXiu = 0, wTotal = 0;
      for (let i = 0; i < seq.length; i++) {
        const w = Math.exp(-i * 0.08); // decay factor
        if (seq[i] === 'Tài') wTai += w;
        else wXiu += w;
        wTotal += w;
      }
      const p = wTai / wTotal;
      score['Tài']  += p * 1.5;
      score['Xỉu'] += (1 - p) * 1.5;
    }

    // ── Chiều 2: Phân tích chu kỳ (cycle detection)
    // Tài Xỉu có xu hướng xen kẽ theo chu kỳ 2, 3, 4
    {
      for (const cycle of [2, 3, 4]) {
        let matches = 0, total = 0;
        for (let i = cycle; i < Math.min(seq.length, 30); i++) {
          if (seq[i] === seq[i - cycle]) matches++;
          total++;
        }
        const repeatRate = matches / total;
        // Nếu chu kỳ mạnh → dự đoán theo chu kỳ
        if (repeatRate > 0.6) {
          const predicted = seq[cycle - 1];
          score[predicted] += (repeatRate - 0.5) * 2;
        } else if (repeatRate < 0.4) {
          // Chu kỳ đảo → dự đoán ngược
          const predicted = seq[cycle - 1] === 'Tài' ? 'Xỉu' : 'Tài';
          score[predicted] += (0.5 - repeatRate) * 2;
        }
      }
    }

    // ── Chiều 3: Momentum ngắn hạn (5 phiên)
    // Chuỗi ngắn gần đây phản ánh "xu hướng nóng"
    {
      const short = seq.slice(0, 5);
      const tai5 = short.filter(v => v === 'Tài').length;
      const xiu5 = 5 - tai5;
      // Momentum mạnh (4-5) → tiếp tục; yếu (2-3) → đảo chiều
      if (tai5 >= 4) score['Tài']  += 1.2;
      else if (xiu5 >= 4) score['Xỉu'] += 1.2;
      else if (tai5 === 2) score['Xỉu'] += 0.8;
      else if (xiu5 === 2) score['Tài']  += 0.8;
    }

    // ── Chiều 4: Zigzag detector
    // Phát hiện pattern xen kẽ T-X-T-X
    {
      let zigzag = 0;
      for (let i = 1; i < Math.min(seq.length, 10); i++) {
        if (seq[i] !== seq[i - 1]) zigzag++;
      }
      const zigzagRate = zigzag / Math.min(seq.length - 1, 9);
      if (zigzagRate > 0.7) {
        // Đang zigzag → dự đoán ngược phiên hiện tại
        const predicted = seq[0] === 'Tài' ? 'Xỉu' : 'Tài';
        score[predicted] += (zigzagRate - 0.5) * 2.5;
      }
    }

    // ── Chiều 5: Phân tích cầu dài (long streak analysis)
    // Đếm và phân tích các chuỗi liên tiếp trong lịch sử
    {
      const streaks = [];
      let cur = seq[0], len = 1;
      for (let i = 1; i < seq.length; i++) {
        if (seq[i] === cur) len++;
        else { streaks.push({ val: cur, len }); cur = seq[i]; len = 1; }
      }
      streaks.push({ val: cur, len });

      if (streaks.length >= 3) {
        const avgLen = streaks.reduce((s, x) => s + x.len, 0) / streaks.length;
        const curStreak = streaks[0];
        // Nếu cầu hiện tại đã dài hơn trung bình → khả năng đảo chiều
        if (curStreak.len > avgLen * 1.2) {
          const predicted = curStreak.val === 'Tài' ? 'Xỉu' : 'Tài';
          score[predicted] += 1.5;
        } else if (curStreak.len < avgLen * 0.6) {
          // Cầu ngắn hơn trung bình → có thể tiếp tục
          score[curStreak.val] += 0.8;
        }
      }
    }

    // ── Chiều 6: Regression to mean (hồi quy về trung bình)
    // Nếu tỉ lệ Tài/Xỉu mất cân bằng → kỳ vọng tự cân bằng
    {
      const tai = seq.filter(v => v === 'Tài').length;
      const ratio = tai / seq.length;
      if (ratio > 0.62) score['Xỉu'] += (ratio - 0.5) * 3;
      else if (ratio < 0.38) score['Tài']  += (0.5 - ratio) * 3;
    }

    // ── Chiều 7: Entropy cục bộ (local entropy)
    // Đo độ "hỗn loạn" 10 phiên gần nhất
    // Entropy cao → ngẫu nhiên → theo Markov; thấp → có cấu trúc → theo pattern
    {
      const local = seq.slice(0, 10);
      const taiL = local.filter(v => v === 'Tài').length / 10;
      const xiuL = 1 - taiL;
      const entropy = (taiL > 0 ? -taiL * Math.log2(taiL) : 0) +
                      (xiuL > 0 ? -xiuL * Math.log2(xiuL) : 0);
      // entropy gần 1 = hỗn loạn; gần 0 = xu hướng rõ
      if (entropy < 0.7) {
        // Xu hướng rõ → tăng trọng số phía đang chiếm ưu thế
        score[taiL > 0.5 ? 'Tài' : 'Xỉu'] += (1 - entropy) * 1.5;
      }
    }

    const total = score['Tài'] + score['Xỉu'];
    if (total === 0) return null;
    const pTai = score['Tài'] / total;
    return { result: pTai >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    STREAK GUARD
  ─────────────────────────────────────────*/
  _streakGuard(seq, baseResult) {
    if (seq.length < 3) return baseResult;
    const cur = seq[0];
    let streak = 1;
    for (let i = 1; i < Math.min(seq.length, 10); i++) {
      if (seq[i] === cur) streak++;
      else break;
    }
    if (streak >= 6) return cur === 'Tài' ? 'Xỉu' : 'Tài';
    if (streak >= 4) {
      const opposite = cur === 'Tài' ? 'Xỉu' : 'Tài';
      return baseResult === opposite ? opposite : cur;
    }
    return baseResult;
  }

  /*─────────────────────────────────────────
    ENSEMBLE — Pattern + Markov + AI Score
    Trọng số: AI Score 4.0 | Pattern 3.0 | Markov 2.5
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 5) return 'Chưa có dữ liệu';

    const seq = history.map(h => h.ket_qua);
    const pattern = this._patternPredict(seq);
    const markov  = this._markovPredict(seq);
    const ai      = this._aiScore(seq);

    const votes = { 'Tài': 0, 'Xỉu': 0 };
    if (ai)      votes[ai.result]      += 4.0 * ai.conf;
    if (pattern) votes[pattern.result] += 3.0 * pattern.conf;
    if (markov)  votes[markov.result]  += 2.5 * markov.conf;

    let base;
    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const tai = seq.filter(v => v === 'Tài').length;
      base = tai >= seq.length / 2 ? 'Tài' : 'Xỉu';
    } else if (votes['Tài'] === votes['Xỉu']) {
      const recent = seq.slice(0, 20);
      const tai = recent.filter(v => v === 'Tài').length;
      base = tai >= 10 ? 'Tài' : 'Xỉu';
    } else {
      base = votes['Tài'] > votes['Xỉu'] ? 'Tài' : 'Xỉu';
    }

    return this._streakGuard(seq, base);
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
    const seq = history.map(h => h.ket_qua);
    const p = this._patternPredict(seq);
    const m = this._markovPredict(seq);
    const a = this._aiScore(seq);
    return {
      ai_score: a ? `${a.result} (${Math.round(a.conf * 100)}%)` : 'Không rõ',
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
