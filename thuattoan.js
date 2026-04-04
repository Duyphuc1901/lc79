class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    PHÂN TÍCH CẦU — nhận diện dạng cầu hiện tại
    Trả về: { type, currentVal, currentLen, avgLen, history }
    type: 'bet' | 'zigzag' | 'mixed'
    bet = bệt (chuỗi liên tiếp dài)
    zigzag = xen kẽ liên tục
    mixed = hỗn hợp
  ─────────────────────────────────────────*/
  _analyzeCau(seq) {
    if (seq.length < 4) return null;

    // Tách chuỗi thành các "cầu" liên tiếp
    const caus = [];
    let cur = seq[0], len = 1;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === cur) {
        len++;
      } else {
        caus.push({ val: cur, len });
        cur = seq[i];
        len = 1;
      }
    }
    caus.push({ val: cur, len });

    const currentCau = caus[0]; // cầu mới nhất (index 0 = phiên gần nhất)
    const avgLen = caus.reduce((s, c) => s + c.len, 0) / caus.length;
    const maxLen = Math.max(...caus.map(c => c.len));

    // Đếm cầu ngắn (len=1) vs dài (len>=3)
    const shortCaus  = caus.filter(c => c.len === 1).length;
    const longCaus   = caus.filter(c => c.len >= 3).length;
    const zigzagRate = shortCaus / caus.length;

    let type;
    if (zigzagRate >= 0.6) type = 'zigzag';       // >60% cầu độ dài 1 → xen kẽ
    else if (avgLen >= 2.5) type = 'bet';          // trung bình cầu dài → bệt
    else type = 'mixed';

    return {
      type,
      currentVal: currentCau.val,
      currentLen: currentCau.len,
      avgLen,
      maxLen,
      zigzagRate,
      caus,                    // toàn bộ chuỗi cầu
      totalCaus: caus.length
    };
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN DỰA TRÊN CẦU — thông minh nhất
    Phân tích xem cầu hiện tại sắp gãy hay tiếp tục.
  ─────────────────────────────────────────*/
  _cauPredict(seq) {
    if (seq.length < 8) return null;
    const info = this._analyzeCau(seq);
    if (!info) return null;

    const { type, currentVal, currentLen, avgLen, maxLen, caus } = info;
    const score = { 'Tài': 0, 'Xỉu': 0 };
    const opposite = currentVal === 'Tài' ? 'Xỉu' : 'Tài';

    // ── Xử lý theo dạng cầu ──

    if (type === 'zigzag') {
      // Cầu xen kẽ → tiếp tục xen kẽ = dự đoán ngược
      score[opposite] += 3.0;

      // Nhưng nếu cầu xen kẽ đã kéo dài quá nhiều (>8 lần)
      // khả năng sắp chuyển sang cầu bệt
      if (info.totalCaus > 10 && info.zigzagRate > 0.8) {
        score[currentVal] += 1.5; // thêm điểm "sắp bệt"
      }
    }

    else if (type === 'bet') {
      // Cầu bệt — cần phán đoán: tiếp tục hay gãy?

      // Tính xác suất gãy dựa trên lịch sử các cầu trước
      let gaNhau = 0, tiepTuc = 0;
      for (let i = 1; i < caus.length; i++) {
        const prev = caus[i];
        // Với các cầu có độ dài tương tự currentLen
        if (Math.abs(prev.len - currentLen) <= 1) {
          // Phiên tiếp theo sau cầu đó là gì?
          if (i > 0) {
            // caus[i-1] là cầu kế tiếp (ngược thời gian = sau)
            gaNhau++;  // cầu đổi = gãy
          }
        }
      }

      // Phân tích độ dài cầu hiện tại so với lịch sử
      if (currentLen >= maxLen) {
        // Đã đạt hoặc vượt cầu dài nhất lịch sử → rất dễ gãy
        score[opposite] += 3.5;
      } else if (currentLen >= avgLen * 1.5) {
        // Dài hơn 1.5x trung bình → dễ gãy
        score[opposite] += 2.5;
      } else if (currentLen >= avgLen) {
        // Đạt trung bình → có thể gãy, có thể tiếp
        score[opposite] += 1.5;
        score[currentVal] += 1.0;
      } else if (currentLen < avgLen * 0.6) {
        // Ngắn hơn trung bình → có thể tiếp tục
        score[currentVal] += 2.0;
      } else {
        // Vùng trung bình → hơi nghiêng về tiếp tục
        score[currentVal] += 1.2;
        score[opposite] += 0.8;
      }

      // Nếu 2 cầu liền trước đều ngắn hơn hiện tại → momentum đang mạnh
      if (caus.length >= 3 && caus[1].len < currentLen && caus[2].len < currentLen) {
        score[currentVal] += 1.0;
      }
    }

    else { // mixed
      // Cầu hỗn hợp → phân tích xu hướng gần nhất (5 cầu)
      const recent5 = caus.slice(0, Math.min(5, caus.length));
      const avgRecent = recent5.reduce((s, c) => s + c.len, 0) / recent5.length;

      if (avgRecent > avgLen) {
        // Xu hướng gần đây đang dài hơn bình thường
        score[currentLen >= avgRecent ? opposite : currentVal] += 1.5;
      } else {
        score[currentLen >= avgLen ? opposite : currentVal] += 1.0;
      }
    }

    const total = score['Tài'] + score['Xỉu'];
    if (total === 0) return null;
    const pTai = score['Tài'] / total;
    return {
      result: pTai >= 0.5 ? 'Tài' : 'Xỉu',
      conf: Math.max(pTai, 1 - pTai),
      cauType: type,
      currentLen
    };
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
    AI SCORE — 7 chiều phân tích
  ─────────────────────────────────────────*/
  _aiScore(seq) {
    if (seq.length < 10) return null;
    const score = { 'Tài': 0, 'Xỉu': 0 };

    // Chiều 1: Tần suất có trọng số thời gian (decay)
    {
      let wTai = 0, wTotal = 0;
      for (let i = 0; i < seq.length; i++) {
        const w = Math.exp(-i * 0.08);
        if (seq[i] === 'Tài') wTai += w;
        wTotal += w;
      }
      const p = wTai / wTotal;
      score['Tài']  += p * 1.5;
      score['Xỉu'] += (1 - p) * 1.5;
    }

    // Chiều 2: Regression to mean
    {
      const tai = seq.filter(v => v === 'Tài').length / seq.length;
      if (tai > 0.62) score['Xỉu'] += (tai - 0.5) * 3;
      else if (tai < 0.38) score['Tài'] += (0.5 - tai) * 3;
    }

    // Chiều 3: Entropy cục bộ
    {
      const local = seq.slice(0, 10);
      const tL = local.filter(v => v === 'Tài').length / 10;
      const xL = 1 - tL;
      const entropy = (tL > 0 ? -tL * Math.log2(tL) : 0) +
                      (xL > 0 ? -xL * Math.log2(xL) : 0);
      if (entropy < 0.7) {
        score[tL > 0.5 ? 'Tài' : 'Xỉu'] += (1 - entropy) * 1.5;
      }
    }

    // Chiều 4: Phân tích sau mỗi lần gãy cầu
    // Sau khi cầu gãy, cầu mới thường ngắn hay dài?
    {
      const info = this._analyzeCau(seq);
      if (info && info.caus.length >= 4) {
        const afterBreak = info.caus.slice(1, 5).map(c => c.len);
        const avgAfter = afterBreak.reduce((s, v) => s + v, 0) / afterBreak.length;
        // Nếu sau gãy thường ngắn → cầu hiện tại dài hơn avgAfter thì sắp gãy
        if (info.currentLen > avgAfter * 1.3) {
          score[info.currentVal === 'Tài' ? 'Xỉu' : 'Tài'] += 1.5;
        }
      }
    }

    const total = score['Tài'] + score['Xỉu'];
    if (total === 0) return null;
    const pTai = score['Tài'] / total;
    return { result: pTai >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    ENSEMBLE — Cầu (cao nhất) + AI + Pattern + Markov
    Cầu phân tích có trọng số cao nhất vì nó
    trực tiếp giải quyết vấn đề bệt → gãy.
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 5) return 'Chưa có dữ liệu';

    const seq     = history.map(h => h.ket_qua);
    const cau     = this._cauPredict(seq);
    const ai      = this._aiScore(seq);
    const pattern = this._patternPredict(seq);
    const markov  = this._markovPredict(seq);

    const votes = { 'Tài': 0, 'Xỉu': 0 };

    if (cau)     votes[cau.result]     += 5.0 * cau.conf;      // Cầu: trọng số cao nhất
    if (ai)      votes[ai.result]      += 3.5 * ai.conf;       // AI Score
    if (pattern) votes[pattern.result] += 2.5 * pattern.conf;  // Pattern
    if (markov)  votes[markov.result]  += 2.0 * markov.conf;   // Markov

    let base;
    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const tai = seq.filter(v => v === 'Tài').length;
      base = tai >= seq.length / 2 ? 'Tài' : 'Xỉu';
    } else {
      base = votes['Tài'] >= votes['Xỉu'] ? 'Tài' : 'Xỉu';
    }

    return base;
  }

  /*─────────────────────────────────────────
    CONFIDENCE
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
    const c = this._cauPredict(seq);
    const a = this._aiScore(seq);
    const p = this._patternPredict(seq);
    const m = this._markovPredict(seq);
    const info = this._analyzeCau(seq);
    return {
      cau_type:  info ? info.type : 'N/A',
      cau_len:   info ? info.currentLen : 0,
      cau_avg:   info ? Math.round(info.avgLen * 10) / 10 : 0,
      cau_pred:  c ? `${c.result} (${Math.round(c.conf * 100)}%)` : 'N/A',
      ai_score:  a ? `${a.result} (${Math.round(a.conf * 100)}%)` : 'N/A',
      pattern:   p ? `${p.result} (${Math.round(p.conf * 100)}%)` : 'N/A',
      markov:    m ? `${m.result} (${Math.round(m.conf * 100)}%)` : 'N/A',
      ensemble:  this.duDoan(history)
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
