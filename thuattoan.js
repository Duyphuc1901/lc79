class ThuatToanB52 {
  /*-----------------------
    Helper Functions
  -----------------------*/
  getTaiXiu(d1, d2, d3) {
    const total = d1 + d2 + d3;
    return total <= 10 ? "Xỉu" : "Tài";
  }

  calculateConfidence(history, prediction, last_n = 12) {
    if (!history.length || history.length < 3) return 0;

    const recent = history.slice(0, last_n);
    
    let correctPredictions = 0;
    let totalComparable = 0;

    for (let i = 0; i < recent.length - 1; i++) {
      const current = recent[i];
      const next = recent[i + 1];
      
      const predicted = this.duDoan(history.slice(i), last_n);
      if (predicted === next.ket_qua && predicted !== "Chưa có dữ liệu" && predicted !== "Không rõ") {
        correctPredictions++;
      }
      totalComparable++;
    }

    return totalComparable > 0 ? Math.round((correctPredictions / totalComparable) * 100) : 0;
  }

  /*-----------------------
    Thuật toán dự đoán
  -----------------------*/
  duDoan(history, last_n = 12) {
    if (!history.length || history.length < 3) return "Chưa có dữ liệu";

    const recent = history.slice(0, last_n);
    const fullSeq = history.map((h) => h.ket_qua);

    // 1. Đếm Tài/Xỉu gần nhất
    const tai_count = recent.filter((h) => h.ket_qua === "Tài").length;
    const xiu_count = recent.filter((h) => h.ket_qua === "Xỉu").length;

    // 2. Phân tích chuỗi (pattern) 3 phiên gần nhất
    const last3 = fullSeq.slice(0, 3).join("-");
    const matchSeq = fullSeq.filter((_, i) => i + 3 < fullSeq.length)
      .map((_, i) => fullSeq.slice(i, i + 3).join("-"));
    const idx = matchSeq.indexOf(last3);
    let seq_predict = null;
    if (idx !== -1 && idx + 3 < fullSeq.length) {
      seq_predict = fullSeq[idx + 3];
    }

    // 3. Markov Chain bậc 2
    let markov_predict = null;
    if (fullSeq.length >= 3) {
      const trans = {};
      for (let i = 0; i < fullSeq.length - 2; i++) {
        const key = fullSeq[i] + "-" + fullSeq[i + 1];
        if (!trans[key]) trans[key] = { Tài: 0, Xỉu: 0 };
        trans[key][fullSeq[i + 2]]++;
      }
      const last2 = fullSeq[0] + "-" + fullSeq[1];
      if (trans[last2]) {
        const { Tài, Xỉu } = trans[last2];
        if (Tài !== Xỉu) {
          markov_predict = Tài > Xỉu ? "Tài" : "Xỉu";
        }
      }
    }

    // 4. Kết hợp kết quả
    let final_predict = "Không rõ";
    
    if (seq_predict) {
      final_predict = seq_predict;
    } else if (markov_predict) {
      final_predict = markov_predict;
    } else {
      final_predict = tai_count > xiu_count ? "Tài" : xiu_count > tai_count ? "Xỉu" : "Không rõ";
    }

    return final_predict;
  }

  // Phương thức bổ sung
  phanTichXacSuat(history) {
    if (!history.length) return { tai: 0, xiu: 0 };
    
    const total = history.length;
    const tai_count = history.filter(h => h.ket_qua === "Tài").length;
    const xiu_count = history.filter(h => h.ket_qua === "Xỉu").length;
    
    return {
      tai: Math.round((tai_count / total) * 100),
      xiu: Math.round((xiu_count / total) * 100),
      tong_phien: total
    };
  }
}

module.exports = ThuatToanB52;
