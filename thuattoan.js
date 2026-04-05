/**
 * MISTAKE-AWARE ENSEMBLE
 * ──────────────────────
 * Học từ sai lầm gần đây:
 * - Theo dõi chuỗi thua hiện tại
 * - Khi đang thua liên tiếp → tăng độ nhạy, ưu tiên tín hiệu đảo chiều
 * - Khi đang thắng → giữ ổn định theo tín hiệu chính
 * - Anti-bias: giảm trọng số thuật toán đang báo sai nhiều
 */
class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

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
    PHÂN TÍCH LỊCH SỬ DỰ ĐOÁN
    Tính chuỗi thua hiện tại và tỉ lệ đúng gần đây
    của từng "loại tín hiệu"
  ─────────────────────────────────────────*/
  _analyzeHistory(history) {
    // history[0] = mới nhất, có ket_qua_thuc_te và status
    const withResult = history.filter(h =>
      h.ket_qua_thuc_te && h.ket_qua_thuc_te !== 'Chờ kết quả...' && h.du_doan
    ).slice(0, 20);

    if (!withResult.length) return { losStreak: 0, recentAcc: 0.5, total: 0 };

    // Đếm chuỗi thua hiện tại
    let losStreak = 0;
    for (const h of withResult) {
      if (h.status === '❌') losStreak++;
      else break;
    }

    // Tỉ lệ đúng 10 phiên gần nhất
    const recent10 = withResult.slice(0, 10);
    const correct  = recent10.filter(h => h.status === '✅').length;
    const recentAcc = recent10.length > 0 ? correct / recent10.length : 0.5;

    return { losStreak, recentAcc, total: withResult.length };
  }

  /*─────────────────────────────────────────
    MARKOV — window ngắn 15 phiên
  ─────────────────────────────────────────*/
  _markov(seq) {
    const s = seq.slice(0, 15);
    if (s.length < 4) return null;

    const scores = { 'Tài': 0, 'Xỉu': 0 };
    let hasData = false;

    for (const order of [1, 2, 3]) {
      if (s.length < order + 3) continue;
      const trans = {};
      for (let i = order; i < s.length; i++) {
        const key = s.slice(i - order, i).join('');
        if (!trans[key]) trans[key] = { 'Tài': 0, 'Xỉu': 0, total: 0 };
        trans[key][s[i]]++;
        trans[key].total++;
      }
      const entry = trans[s.slice(0, order).join('')];
      if (!entry || entry.total < 2) continue;
      const pTai = entry['Tài'] / entry.total;
      const pXiu = entry['Xỉu'] / entry.total;
      if (Math.abs(pTai - pXiu) < 0.15) continue;
      scores['Tài']  += pTai * order;
      scores['Xỉu'] += pXiu * order;
      hasData = true;
    }

    if (!hasData) return null;
    const total = scores['Tài'] + scores['Xỉu'];
    const pTai  = scores['Tài'] / total;
    if (Math.abs(pTai - 0.5) < 0.08) return null;
    return { result: pTai > 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    PATTERN MATCHING — bậc 3, 4
  ─────────────────────────────────────────*/
  _pattern(seq) {
    if (seq.length < 8) return null;
    const scores = { 'Tài': 0, 'Xỉu': 0 };
    let hasData = false;

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
      if (matched < 3) continue;
      const rate = Math.max(tai, xiu) / matched;
      if (rate < 0.6) continue;
      scores[tai > xiu ? 'Tài' : 'Xỉu'] += rate * depth;
      hasData = true;
    }

    if (!hasData) return null;
    const total = scores['Tài'] + scores['Xỉu'];
    const pTai  = scores['Tài'] / total;
    return { result: pTai >= 0.5 ? 'Tài' : 'Xỉu', conf: Math.max(pTai, 1 - pTai) };
  }

  /*─────────────────────────────────────────
    CẦU THỐNG KÊ
  ─────────────────────────────────────────*/
  _cauStat(seq) {
    if (seq.length < 10) return null;
    const caus = this._splitCau(seq.slice(0, 25));
    if (caus.length < 4) return null;

    const current  = caus[0];
    const opposite = current.val === 'Tài' ? 'Xỉu' : 'Tài';
    const sameVal  = caus.slice(1).filter(c => c.val === current.val);
    if (sameVal.length < 2) return null;

    const brokeAtOrBefore = sameVal.filter(c => c.len <= current.len).length;
    const pBreak = brokeAtOrBefore / sameVal.length;

    if (pBreak > 0.65) return { result: opposite,     conf: pBreak };
    if (pBreak < 0.35) return { result: current.val,  conf: 1 - pBreak };
    return null;
  }

  /*─────────────────────────────────────────
    REGRESSION TO MEAN — 15 phiên
  ─────────────────────────────────────────*/
  _regression(seq) {
    const recent = seq.slice(0, 15);
    if (recent.length < 8) return null;
    const tai   = recent.filter(v => v === 'Tài').length;
    const ratio = tai / recent.length;
    if (ratio > 0.6)  return { result: 'Xỉu', conf: ratio };
    if (ratio < 0.4)  return { result: 'Tài',  conf: 1 - ratio };
    return null;
  }

  /*─────────────────────────────────────────
    LOSING STREAK RECOVERY
    Khi đang thua >= 3 liên tiếp:
    → Tính xem chiều nào bị dự đoán sai nhiều
    → Chuyển sang chiều ngược lại
    Đây là cơ chế cắt chuỗi thua chủ động.
  ─────────────────────────────────────────*/
  _streakRecovery(history, losStreak) {
    if (losStreak < 3) return null;

    // Lấy các phiên đang thua
    const losing = history.filter(h =>
      h.status === '❌' && h.du_doan && h.ket_qua_thuc_te
    ).slice(0, losStreak);

    if (!losing.length) return null;

    // Đếm chiều đang dự đoán sai
    const wrongTai = losing.filter(h => h.du_doan === 'Tài').length;
    const wrongXiu = losing.filter(h => h.du_doan === 'Xỉu').length;

    // Nếu sai liên tục cùng 1 chiều → đảo chiều
    if (wrongTai >= losStreak * 0.7) return { result: 'Xỉu', conf: 0.65 };
    if (wrongXiu >= losStreak * 0.7) return { result: 'Tài',  conf: 0.65 };

    return null;
  }

  /*─────────────────────────────────────────
    ENSEMBLE CHÍNH
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 8) return 'Chưa có dữ liệu';

    const seq      = history.map(h => h.ket_qua);
    const { losStreak, recentAcc } = this._analyzeHistory(history);

    const markov     = this._markov(seq);
    const pattern    = this._pattern(seq);
    const cauStat    = this._cauStat(seq);
    const regression = this._regression(seq);
    const recovery   = this._streakRecovery(history, losStreak);

    // ── Trọng số động theo tình trạng hiện tại ──
    let wMarkov = 2.5, wPattern = 2.5, wCau = 2.5, wRegression = 2.0, wRecovery = 0;

    // Đang thua liên tiếp → tăng trọng số recovery và regression
    if (losStreak >= 3) {
      wRecovery   = 4.0; // recovery lên cao nhất
      wRegression = 3.0;
      wMarkov     = 1.5; // giảm markov (đang sai)
      wPattern    = 1.5;
      wCau        = 1.5;
    } else if (losStreak === 2) {
      wRecovery   = 2.0;
      wRegression = 2.5;
    }

    // Đang thắng tốt → tin vào markov và pattern hơn
    if (recentAcc > 0.65) {
      wMarkov  = 3.0;
      wPattern = 3.0;
    }

    const votes = { 'Tài': 0, 'Xỉu': 0 };
    const add = (r, conf, w) => { if (r) votes[r] += w * (conf || 0.5); };

    add(recovery?.result,   recovery?.conf,   wRecovery);
    add(markov?.result,     markov?.conf,     wMarkov);
    add(pattern?.result,    pattern?.conf,    wPattern);
    add(cauStat?.result,    cauStat?.conf,    wCau);
    add(regression?.result, regression?.conf, wRegression);

    if (votes['Tài'] === 0 && votes['Xỉu'] === 0) {
      const tai = seq.slice(0, 15).filter(v => v === 'Tài').length;
      return tai > 7 ? 'Tài' : 'Xỉu';
    }

    return votes['Tài'] >= votes['Xỉu'] ? 'Tài' : 'Xỉu';
  }

  /*─────────────────────────────────────────
    CONFIDENCE
  ─────────────────────────────────────────*/
  calculateConfidence(history, prediction, last_n = 15) {
    if (history.length < 8) return 0;
    const withResult = history.filter(h =>
      h.ket_qua_thuc_te && h.ket_qua_thuc_te !== 'Chờ kết quả...'
    ).slice(0, last_n);

    if (withResult.length < 5) return 0;
    const correct = withResult.filter(h => h.status === '✅').length;
    return Math.round((correct / withResult.length) * 100);
  }

  duDoanChiTiet(history) {
    if (history.length < 8) return null;
    const seq  = history.map(h => h.ket_qua);
    const info = this._analyzeHistory(history);
    const m    = this._markov(seq);
    const p    = this._pattern(seq);
    const c    = this._cauStat(seq);
    const r    = this._regression(seq);
    const rec  = this._streakRecovery(history, info.losStreak);

    return {
      losing_streak: info.losStreak,
      recent_acc:    `${Math.round(info.recentAcc * 100)}%`,
      recovery:      rec  ? `${rec.result} (kích hoạt)`                    : 'Không',
      markov:        m    ? `${m.result} (${Math.round(m.conf * 100)}%)`   : 'Bỏ qua',
      pattern:       p    ? `${p.result} (${Math.round(p.conf * 100)}%)`   : 'Bỏ qua',
      cau_stat:      c    ? `${c.result} (${Math.round(c.conf * 100)}%)`   : 'Bỏ qua',
      regression:    r    ? `${r.result} (${Math.round(r.conf * 100)}%)`   : 'Bỏ qua',
      ensemble:      this.duDoan(history)
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
