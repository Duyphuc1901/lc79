class ThuatToanB52 {
  /*-----------------------
    Helper
  -----------------------*/
  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? "Xỉu" : "Tài";
  }

  // Tính độ tin cậy dựa trên back-test 12 phiên gần nhất
  calculateConfidence(history, prediction, last_n = 12) {
    if (history.length < 3) return 0;
    const recent = history.slice(0, last_n);
    let correct = 0, total = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      const predicted = this.duDoan(history.slice(i), last_n);
      if (predicted === recent[i + 1].ket_qua &&
          predicted !== "Chưa có dữ liệu" && predicted !== "Không rõ") correct++;
      total++;
    }
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  }

  /*-----------------------
    1. Pattern Matching (3 phiên)
  -----------------------*/
  _patternPredict(fullSeq) {
    if (fullSeq.length < 4) return null;
    const last3 = fullSeq.slice(0, 3).join("-");
    for (let i = 1; i + 3 < fullSeq.length; i++) {
      if (fullSeq.slice(i, i + 3).join("-") === last3) {
        return fullSeq[i + 3];
      }
    }
    return null;
  }

  /*-----------------------
    2. Markov Chain bậc 2
  -----------------------*/
  _markovPredict(fullSeq) {
    if (fullSeq.length < 3) return null;
    const trans = {};
    for (let i = 0; i < fullSeq.length - 2; i++) {
      const key = fullSeq[i] + "|" + fullSeq[i + 1];
      if (!trans[key]) trans[key] = { Tài: 0, Xỉu: 0 };
      trans[key][fullSeq[i + 2]]++;
    }
    const key = fullSeq[0] + "|" + fullSeq[1];
    if (trans[key]) {
      const { Tài, Xỉu } = trans[key];
      if (Tài !== Xỉu) return Tài > Xỉu ? "Tài" : "Xỉu";
    }
    return null;
  }

  /*-----------------------
    3. Naive Bayes
    P(Tài|last N) dựa trên tần suất có điều kiện
  -----------------------*/
  _bayesPredict(fullSeq, last_n = 20) {
    if (fullSeq.length < 5) return null;
    const train = fullSeq.slice(1);           // bỏ phiên hiện tại
    const context = fullSeq.slice(0, 3);      // 3 phiên gần nhất làm feature

    let tai_given = 0.5, xiu_given = 0.5;
    let tai_total = 0, xiu_total = 0;

    // Prior
    train.forEach(r => r === "Tài" ? tai_total++ : xiu_total++);
    const p_tai = tai_total / train.length;
    const p_xiu = xiu_total / train.length;

    // Likelihood: đếm lần context xuất hiện trước kết quả
    let tai_match = 0, xiu_match = 0;
    for (let i = 0; i + 3 < train.length; i++) {
      const match = context.every((v, j) => train[i + j] === v);
      if (match) {
        if (train[i + 3] === "Tài") tai_match++;
        else xiu_match++;
      }
    }

    if (tai_match + xiu_match === 0) return null;

    const score_tai = p_tai * (tai_match / (tai_match + xiu_match + 1));
    const score_xiu = p_xiu * (xiu_match / (tai_match + xiu_match + 1));

    if (score_tai === score_xiu) return null;
    return score_tai > score_xiu ? "Tài" : "Xỉu";
  }

  /*-----------------------
    4. Momentum
    Nếu chuỗi liên tiếp ≥ 3 → tiếp tục; hoặc phát hiện đảo chiều
  -----------------------*/
  _momentumPredict(fullSeq) {
    if (fullSeq.length < 3) return null;
    const cur = fullSeq[0];
    let streak = 1;
    for (let i = 1; i < fullSeq.length; i++) {
      if (fullSeq[i] === cur) streak++;
      else break;
    }

    // Chuỗi 1-2: có thể đảo chiều
    if (streak <= 2) {
      // Xem có pattern đảo chiều không (xen kẽ)
      const isAlt = fullSeq.slice(0, 4).every((v, i, a) => i === 0 || v !== a[i - 1]);
      if (isAlt && fullSeq.length >= 4) return cur === "Tài" ? "Xỉu" : "Tài";
      return null;
    }
    // Chuỗi 3+: tiếp tục theo momentum
    if (streak >= 3 && streak <= 5) return cur;
    // Chuỗi quá dài (6+): khả năng đảo chiều cao
    if (streak >= 6) return cur === "Tài" ? "Xỉu" : "Tài";
    return cur;
  }

  /*-----------------------
    5. Shannon Entropy
    Entropy thấp → chuỗi có trật tự → dự đoán theo pattern
    Entropy cao → ngẫu nhiên → theo tần suất
  -----------------------*/
  _entropyPredict(fullSeq, last_n = 16) {
    if (fullSeq.length < 4) return null;
    const recent = fullSeq.slice(0, last_n);
    const tai = recent.filter(v => v === "Tài").length;
    const xiu = recent.length - tai;
    const p1 = tai / recent.length;
    const p2 = xiu / recent.length;

    const entropy = (p1 > 0 ? -p1 * Math.log2(p1) : 0) +
                    (p2 > 0 ? -p2 * Math.log2(p2) : 0);

    // Entropy gần 1 = rất ngẫu nhiên, gần 0 = có xu hướng rõ
    if (entropy < 0.85) {
      // Có xu hướng rõ → theo bên nhiều hơn
      return tai > xiu ? "Tài" : "Xỉu";
    } else {
      // Ngẫu nhiên → theo Markov
      return this._markovPredict(fullSeq);
    }
  }

  /*-----------------------
    Ensemble: bỏ phiếu có trọng số
  -----------------------*/
  duDoan(history, last_n = 12) {
    if (history.length < 3) return "Chưa có dữ liệu";

    const fullSeq = history.map(h => h.ket_qua);

    const votes = { Tài: 0, Xỉu: 0 };

    const add = (result, weight = 1) => {
      if (result === "Tài" || result === "Xỉu") votes[result] += weight;
    };

    add(this._patternPredict(fullSeq), 3);   // Pattern matching: trọng số cao nhất
    add(this._markovPredict(fullSeq),   2.5); // Markov
    add(this._bayesPredict(fullSeq),    2);   // Bayes
    add(this._momentumPredict(fullSeq), 1.5); // Momentum
    add(this._entropyPredict(fullSeq),  1);   // Entropy

    if (votes.Tài === votes.Xỉu) {
      // Hòa → theo tần suất 12 phiên
      const recent = fullSeq.slice(0, last_n);
      const tai = recent.filter(v => v === "Tài").length;
      return tai >= recent.length / 2 ? "Tài" : "Xỉu";
    }

    return votes.Tài > votes.Xỉu ? "Tài" : "Xỉu";
  }

  // Chi tiết từng thuật toán (dùng cho debug / hiển thị)
  duDoanChiTiet(history) {
    if (history.length < 3) return null;
    const fullSeq = history.map(h => h.ket_qua);
    return {
      pattern:  this._patternPredict(fullSeq)  || "Không rõ",
      markov:   this._markovPredict(fullSeq)   || "Không rõ",
      bayes:    this._bayesPredict(fullSeq)    || "Không rõ",
      momentum: this._momentumPredict(fullSeq) || "Không rõ",
      entropy:  this._entropyPredict(fullSeq)  || "Không rõ",
      ensemble: this.duDoan(history)
    };
  }

  phanTichXacSuat(history) {
    if (!history.length) return { tai: 0, xiu: 0 };
    const total = history.length;
    const tai = history.filter(h => h.ket_qua === "Tài").length;
    return {
      tai:  Math.round((tai / total) * 100),
      xiu:  Math.round(((total - tai) / total) * 100),
      tong_phien: total
    };
  }
}

module.exports = ThuatToanB52;
