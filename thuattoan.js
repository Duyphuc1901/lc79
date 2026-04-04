/**
 * ADAPTIVE MARKOV CHAIN
 * ─────────────────────
 * Một thuật toán duy nhất, nhưng rất sâu:
 *
 * 1. Xây bảng chuyển trạng thái Markov bậc 1→4
 * 2. Mỗi bậc tự đánh giá độ chính xác trên lịch sử thực tế
 * 3. Bậc nào đúng nhiều hơn → trọng số cao hơn (adaptive)
 * 4. Kết quả cuối = bậc có trọng số cao nhất thắng
 *
 * Không đoán điểm gãy, không có bias — chỉ học từ data thật.
 */
class ThuatToanB52 {

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    XÂY BẢNG MARKOV bậc N
    trans[key] = { Tài: số lần, Xỉu: số lần, total }
  ─────────────────────────────────────────*/
  _buildMarkov(seq, order) {
    const trans = {};
    for (let i = order; i < seq.length; i++) {
      const key  = seq.slice(i - order, i).join('');
      const next = seq[i];
      if (!trans[key]) trans[key] = { 'Tài': 0, 'Xỉu': 0, total: 0 };
      trans[key][next]++;
      trans[key].total++;
    }
    return trans;
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN TỪ BẢNG MARKOV bậc N
    Trả về { result, prob } hoặc null nếu không đủ data
  ─────────────────────────────────────────*/
  _markovGuess(trans, seq, order) {
    const key   = seq.slice(0, order).join('');
    const entry = trans[key];
    if (!entry || entry.total < 3) return null;

    const pTai = entry['Tài'] / entry.total;
    const pXiu = entry['Xỉu'] / entry.total;

    // Chỉ dự đoán khi một bên có xác suất rõ ràng hơn
    if (Math.abs(pTai - pXiu) < 0.15) return null; // quá cân bằng → bỏ qua

    return {
      result: pTai > pXiu ? 'Tài' : 'Xỉu',
      prob:   Math.max(pTai, pXiu)
    };
  }

  /*─────────────────────────────────────────
    ĐÁNH GIÁ ĐỘ CHÍNH XÁC của bậc N
    Back-test trên window 15 phiên gần nhất
    Trả về accuracy (0.0 → 1.0)
  ─────────────────────────────────────────*/
  _evalOrder(seq, order, window = 15) {
    if (seq.length < order + window + 1) return 0;

    let correct = 0, total = 0;

    for (let i = 0; i < window; i++) {
      // Dùng data từ phiên i+1 trở đi để dự đoán phiên i
      const trainSeq = seq.slice(i + 1);
      if (trainSeq.length < order + 3) continue;

      const trans = this._buildMarkov(trainSeq, order);
      const guess = this._markovGuess(trans, seq.slice(i, i + order), order);

      if (!guess) continue;
      if (guess.result === seq[i]) correct++;
      total++;
    }

    return total >= 3 ? correct / total : 0;
  }

  /*─────────────────────────────────────────
    ADAPTIVE MARKOV — thuật toán chính
    Tự chọn bậc tốt nhất dựa trên back-test thực tế
  ─────────────────────────────────────────*/
  _adaptiveMarkov(seq) {
    if (seq.length < 8) return null;

    const orders  = [1, 2, 3, 4];
    const results = [];

    for (const order of orders) {
      if (seq.length < order + 4) continue;

      const accuracy = this._evalOrder(seq, order);
      if (accuracy === 0) continue;

      const trans = this._buildMarkov(seq, order);
      const guess = this._markovGuess(trans, seq, order);
      if (!guess) continue;

      results.push({
        order,
        result:   guess.result,
        prob:     guess.prob,
        accuracy, // độ chính xác thực tế trên 15 phiên gần nhất
        score:    guess.prob * accuracy // điểm tổng hợp
      });
    }

    if (!results.length) return null;

    // Chọn bậc có score cao nhất
    results.sort((a, b) => b.score - a.score);
    return results[0];
  }

  /*─────────────────────────────────────────
    DU DOAN CHÍNH
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 8) return 'Chưa có dữ liệu';

    const seq    = history.map(h => h.ket_qua);
    const best   = this._adaptiveMarkov(seq);

    if (!best) {
      // Fallback: tần suất 20 phiên gần nhất
      const recent = seq.slice(0, 20);
      const tai    = recent.filter(v => v === 'Tài').length;
      return tai > recent.length / 2 ? 'Tài' : 'Xỉu';
    }

    return best.result;
  }

  /*─────────────────────────────────────────
    CONFIDENCE — accuracy thực tế của bậc tốt nhất
  ─────────────────────────────────────────*/
  calculateConfidence(history, prediction, last_n = 20) {
    if (history.length < 8) return 0;

    const seq  = history.map(h => h.ket_qua);
    const best = this._adaptiveMarkov(seq);

    if (!best) return 0;

    // Trả về accuracy % của bậc được chọn
    return Math.round(best.accuracy * 100);
  }

  /*─────────────────────────────────────────
    CHI TIẾT
  ─────────────────────────────────────────*/
  duDoanChiTiet(history) {
    if (history.length < 8) return null;

    const seq     = history.map(h => h.ket_qua);
    const orders  = [1, 2, 3, 4];
    const detail  = {};

    for (const order of orders) {
      if (seq.length < order + 4) continue;
      const acc   = this._evalOrder(seq, order);
      const trans = this._buildMarkov(seq, order);
      const guess = this._markovGuess(trans, seq, order);
      detail[`bac_${order}`] = guess
        ? `${guess.result} | prob=${Math.round(guess.prob * 100)}% | acc=${Math.round(acc * 100)}%`
        : 'Không đủ data';
    }

    const best = this._adaptiveMarkov(seq);
    return {
      ...detail,
      best_order: best ? best.order : 'N/A',
      best_score: best ? Math.round(best.score * 100) : 0,
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
