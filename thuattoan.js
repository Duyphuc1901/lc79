/**
 * DICE ANALYSIS + TOTAL ANALYSIS
 * ────────────────────────────────
 * 1. Phân tích từng xúc xắc riêng biệt (d1, d2, d3)
 *    - Tìm lịch sử các phiên có xúc xắc X = giá trị hiện tại
 *    - Xem phiên tiếp theo xúc xắc X thường ra số mấy
 *    - Dự đoán số tiếp theo cho từng viên (trung bình có trọng số)
 *    - Cộng 3 viên → ≤10 = Xỉu, ≥11 = Tài
 *
 * 2. Phân tích theo tổng điểm
 *    - Tìm phiên gần nhất trong lịch sử có cùng tổng
 *    - Xem phiên ngay sau đó ra Tài hay Xỉu
 *
 * 3. Kết hợp:
 *    - Cùng kết quả → lấy kết quả đó
 *    - Khác nhau → ưu tiên dự đoán xúc xắc
 */
class ThuatToanB52 {

  constructor() {
    this.startTime = Date.now();
  }

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN GIÁ TRỊ TIẾP THEO CHO 1 XÚC XẮC
    - Tìm tất cả phiên trong lịch sử mà xúc_xac_N = giá trị hiện tại
    - Xem phiên tiếp theo (phiên trước trong mảng vì mới nhất ở đầu)
      xúc_xac_N ra giá trị bao nhiêu
    - Trả về giá trị dự đoán (trung bình có trọng số, phiên gần hơn nặng hơn)
  ─────────────────────────────────────────*/
  _predictOneDice(history, diceIndex, currentValue) {
    // diceIndex: 1, 2, hoặc 3
    const field = `xuc_xac_${diceIndex}`;

    // Tìm các phiên trong lịch sử có xúc xắc này = currentValue
    // history[0] = mới nhất
    // Cần: history[i][field] === currentValue → history[i-1][field] = giá trị tiếp theo
    const nextValues = [];

    for (let i = history.length - 1; i >= 1; i--) {
      if (history[i][field] === currentValue) {
        const nextVal = history[i - 1][field]; // phiên tiếp theo
        if (nextVal >= 1 && nextVal <= 6) {
          // Trọng số: phiên gần hơn (i nhỏ hơn) → weight cao hơn
          const weight = 1 + (history.length - i) / history.length;
          nextValues.push({ val: nextVal, weight });
        }
      }
    }

    if (!nextValues.length) return null;

    // Tính trung bình có trọng số
    const totalWeight  = nextValues.reduce((s, x) => s + x.weight, 0);
    const weightedSum  = nextValues.reduce((s, x) => s + x.val * x.weight, 0);
    const predicted    = weightedSum / totalWeight;

    // Phân phối: đếm số lần từng giá trị 1-6 xuất hiện
    const dist = {};
    for (let v = 1; v <= 6; v++) dist[v] = 0;
    nextValues.forEach(x => dist[x.val] += x.weight);

    // Tìm giá trị có xác suất cao nhất (mode)
    let modeVal = 1, modeWeight = 0;
    for (let v = 1; v <= 6; v++) {
      if (dist[v] > modeWeight) { modeWeight = dist[v]; modeVal = v; }
    }

    return {
      predicted: Math.round(predicted),  // làm tròn về số nguyên gần nhất
      mode:      modeVal,                // giá trị phổ biến nhất
      avg:       predicted,
      samples:   nextValues.length,
      dist
    };
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN THEO XÚC XẮC
    Phân tích cả 3 viên, cộng tổng → Tài/Xỉu
  ─────────────────────────────────────────*/
  _dicePredict(history) {
    if (history.length < 5) return null;

    const current = history[0]; // phiên mới nhất
    const d1 = current.xuc_xac_1;
    const d2 = current.xuc_xac_2;
    const d3 = current.xuc_xac_3;

    if (!d1 || !d2 || !d3) return null;

    const r1 = this._predictOneDice(history, 1, d1);
    const r2 = this._predictOneDice(history, 2, d2);
    const r3 = this._predictOneDice(history, 3, d3);

    // Nếu không đủ data cho viên nào → dùng giá trị trung bình xúc xắc (3.5)
    const p1 = r1 ? r1.mode : Math.round((d1 + 3.5) / 2);
    const p2 = r2 ? r2.mode : Math.round((d2 + 3.5) / 2);
    const p3 = r3 ? r3.mode : Math.round((d3 + 3.5) / 2);

    const tongDuDoan = p1 + p2 + p3;
    const result     = tongDuDoan <= 10 ? 'Xỉu' : 'Tài';

    return {
      d1_current: d1, d1_predict: p1, d1_samples: r1?.samples || 0,
      d2_current: d2, d2_predict: p2, d2_samples: r2?.samples || 0,
      d3_current: d3, d3_predict: p3, d3_samples: r3?.samples || 0,
      tong_du_doan: tongDuDoan,
      result
    };
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN THEO TỔNG ĐIỂM
    Tìm phiên gần nhất có cùng tổng → xem phiên sau ra gì
  ─────────────────────────────────────────*/
  _totalPredict(history) {
    if (history.length < 3) return null;

    const currentTong = history[0].tong;
    if (!currentTong) return null;

    // Tìm từ phiên gần nhất (i=1) đến cũ nhất
    // history[i].tong === currentTong → history[i-1].ket_qua là phiên tiếp theo
    for (let i = 1; i < history.length; i++) {
      if (history[i].tong === currentTong) {
        const nextResult = history[i - 1].ket_qua;
        if (nextResult === 'Tài' || nextResult === 'Xỉu') {
          return {
            found_at:   i,        // cách bao nhiêu phiên
            tong:       currentTong,
            result:     nextResult
          };
        }
      }
    }

    // Không tìm được tổng chính xác → thử ±1
    for (let i = 1; i < history.length; i++) {
      if (Math.abs(history[i].tong - currentTong) === 1) {
        const nextResult = history[i - 1].ket_qua;
        if (nextResult === 'Tài' || nextResult === 'Xỉu') {
          return {
            found_at:   i,
            tong:       history[i].tong,
            result:     nextResult,
            approx:     true    // khớp gần đúng ±1
          };
        }
      }
    }

    return null;
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN CHÍNH
    Kết hợp dice + total:
    - Đồng ý → lấy kết quả đó
    - Khác nhau → ưu tiên dice
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 5) return 'Chưa có dữ liệu';

    const dice  = this._dicePredict(history);
    const total = this._totalPredict(history);

    if (!dice && !total) return 'Chưa có dữ liệu';
    if (!dice)  return total.result;
    if (!total) return dice.result;

    // Cả hai cùng kết quả
    if (dice.result === total.result) return dice.result;

    // Khác nhau → ưu tiên dice
    return dice.result;
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
      mode:   'Dice Analysis + Total Analysis'
    };
  }

  /*─────────────────────────────────────────
    CHI TIẾT — dùng cho /api/detail
  ─────────────────────────────────────────*/
  duDoanChiTiet(history) {
    if (history.length < 5) return null;

    const dice  = this._dicePredict(history);
    const total = this._totalPredict(history);
    const final = this.duDoan(history);

    return {
      // Phân tích xúc xắc
      xuc_xac: dice ? {
        d1: `${dice.d1_current} → dự đoán ${dice.d1_predict} (${dice.d1_samples} mẫu)`,
        d2: `${dice.d2_current} → dự đoán ${dice.d2_predict} (${dice.d2_samples} mẫu)`,
        d3: `${dice.d3_current} → dự đoán ${dice.d3_predict} (${dice.d3_samples} mẫu)`,
        tong_du_doan: dice.tong_du_doan,
        ket_qua: dice.result
      } : 'Không đủ data',

      // Phân tích tổng
      phan_tich_tong: total ? {
        tong_hien_tai:  history[0].tong,
        tim_thay_tai:   `${total.found_at} phiên trước${total.approx ? ' (±1)' : ''}`,
        ket_qua:        total.result
      } : 'Không tìm được',

      // Kết hợp
      dong_thuan:  dice && total ? dice.result === total.result : null,
      uu_tien:     dice && total && dice.result !== total.result ? 'Xúc xắc' : null,
      du_doan:     final,

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
