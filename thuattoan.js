/**
 * 3 THUẬT TOÁN KẾT HỢP
 * ─────────────────────
 * 1. DICE  — Xúc xắc: lấy phiên gần nhất có cùng giá trị từng viên
 * 2. TOTAL — Tổng: lấy phiên gần nhất có cùng tổng → phiên sau Tài/Xỉu
 * 3. ODD   — Chẵn/Lẻ: lấy phiên gần nhất cùng kết quả + cùng tổng
 *            → phiên sau tổng chẵn = Xỉu, lẻ = Tài
 *
 * Kết hợp:
 * - 2/3 đồng thuận → lấy kết quả đó, do_tin_cay = 50%
 * - 3/3 đồng thuận → lấy kết quả đó, do_tin_cay = 80%
 */
class ThuatToanB52 {

  constructor() {
    this.startTime = Date.now();
  }

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 1: PHÂN TÍCH XÚC XẮC
    Với mỗi viên, tìm phiên GẦN NHẤT có cùng giá trị
    → lấy giá trị của viên đó ở phiên tiếp theo
    Cộng 3 viên dự đoán → ≤10 Xỉu, ≥11 Tài
  ─────────────────────────────────────────*/
  _dicePredict(history) {
    if (history.length < 3) return null;

    const cur = history[0];
    const d1 = cur.xuc_xac_1;
    const d2 = cur.xuc_xac_2;
    const d3 = cur.xuc_xac_3;
    if (!d1 || !d2 || !d3) return null;

    // Tìm phiên gần nhất cho từng viên
    // history[i] có giá trị → phiên tiếp theo là history[i-1]
    const findNearest = (diceField, value) => {
      for (let i = 1; i < history.length; i++) {
        if (history[i][diceField] === value) {
          const next = history[i - 1][diceField];
          if (next >= 1 && next <= 6) return { next, found_at: i };
        }
      }
      return null;
    };

    const r1 = findNearest('xuc_xac_1', d1);
    const r2 = findNearest('xuc_xac_2', d2);
    const r3 = findNearest('xuc_xac_3', d3);

    // Fallback: dùng giá trị hiện tại nếu không tìm được
    const p1 = r1 ? r1.next : d1;
    const p2 = r2 ? r2.next : d2;
    const p3 = r3 ? r3.next : d3;

    const tongDuDoan = p1 + p2 + p3;

    return {
      d1_cur: d1, d1_pred: p1, d1_at: r1?.found_at,
      d2_cur: d2, d2_pred: p2, d2_at: r2?.found_at,
      d3_cur: d3, d3_pred: p3, d3_at: r3?.found_at,
      tong_du_doan: tongDuDoan,
      result: tongDuDoan <= 10 ? 'Xỉu' : 'Tài'
    };
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 2: PHÂN TÍCH TỔNG
    Tìm phiên GẦN NHẤT có cùng tổng
    → phiên tiếp theo ra Tài hay Xỉu
  ─────────────────────────────────────────*/
  _totalPredict(history) {
    if (history.length < 3) return null;

    const currentTong = history[0].tong;
    if (!currentTong) return null;

    // Tìm chính xác trước
    for (let i = 1; i < history.length; i++) {
      if (history[i].tong === currentTong) {
        const next = history[i - 1].ket_qua;
        if (next === 'Tài' || next === 'Xỉu') {
          return { tong: currentTong, found_at: i, result: next, approx: false };
        }
      }
    }

    // Fallback ±1
    for (let i = 1; i < history.length; i++) {
      if (Math.abs(history[i].tong - currentTong) === 1) {
        const next = history[i - 1].ket_qua;
        if (next === 'Tài' || next === 'Xỉu') {
          return { tong: history[i].tong, found_at: i, result: next, approx: true };
        }
      }
    }

    return null;
  }

  /*─────────────────────────────────────────
    THUẬT TOÁN 3: PHÂN TÍCH CHẴN/LẺ
    Tìm phiên GẦN NHẤT có cùng kết quả VÀ cùng tổng
    → phiên tiếp theo tổng chẵn = Xỉu, lẻ = Tài
    Nếu không có cùng kết quả + tổng → chỉ cùng kết quả
  ─────────────────────────────────────────*/
  _oddEvenPredict(history) {
    if (history.length < 3) return null;

    const curKq   = history[0].ket_qua;
    const curTong = history[0].tong;
    if (!curKq || !curTong) return null;

    // Thử 1: tìm phiên gần nhất cùng kết quả VÀ cùng tổng
    for (let i = 1; i < history.length; i++) {
      if (history[i].ket_qua === curKq && history[i].tong === curTong) {
        const nextTong = history[i - 1].tong;
        if (nextTong) {
          const isEven  = nextTong % 2 === 0;
          return {
            found_at:  i,
            match:     `${curKq} + tổng ${curTong}`,
            next_tong: nextTong,
            chan_le:   isEven ? 'Chẵn' : 'Lẻ',
            result:    isEven ? 'Xỉu' : 'Tài'
          };
        }
      }
    }

    // Thử 2: chỉ cần cùng kết quả + tổng ±1
    for (let i = 1; i < history.length; i++) {
      if (history[i].ket_qua === curKq && Math.abs(history[i].tong - curTong) <= 1) {
        const nextTong = history[i - 1].tong;
        if (nextTong) {
          const isEven = nextTong % 2 === 0;
          return {
            found_at:  i,
            match:     `${curKq} + tổng ${history[i].tong} (±1)`,
            next_tong: nextTong,
            chan_le:   isEven ? 'Chẵn' : 'Lẻ',
            result:    isEven ? 'Xỉu' : 'Tài'
          };
        }
      }
    }

    // Thử 3: chỉ cùng kết quả gần nhất
    for (let i = 1; i < history.length; i++) {
      if (history[i].ket_qua === curKq) {
        const nextTong = history[i - 1].tong;
        if (nextTong) {
          const isEven = nextTong % 2 === 0;
          return {
            found_at:  i,
            match:     `${curKq} (chỉ kết quả)`,
            next_tong: nextTong,
            chan_le:   isEven ? 'Chẵn' : 'Lẻ',
            result:    isEven ? 'Xỉu' : 'Tài'
          };
        }
      }
    }

    return null;
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN CHÍNH — Vote 3 thuật toán
    - 2/3 đồng thuận → kết quả đó, tin cậy 50%
    - 3/3 đồng thuận → kết quả đó, tin cậy 80%
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 5) return 'Chưa có dữ liệu';

    const dice  = this._dicePredict(history);
    const total = this._totalPredict(history);
    const oe    = this._oddEvenPredict(history);

    const results = [
      dice?.result,
      total?.result,
      oe?.result
    ].filter(Boolean);

    if (!results.length) return 'Chưa có dữ liệu';

    const tai = results.filter(r => r === 'Tài').length;
    const xiu = results.filter(r => r === 'Xỉu').length;

    // Ít nhất 2/3 đồng thuận
    if (tai >= 2) return 'Tài';
    if (xiu >= 2) return 'Xỉu';

    // Chỉ có 1 kết quả → dùng luôn
    return results[0];
  }

  /*─────────────────────────────────────────
    CONFIDENCE — dựa trên mức đồng thuận
  ─────────────────────────────────────────*/
  calculateConfidence(history) {
    if (history.length < 5) return 0;

    const dice  = this._dicePredict(history);
    const total = this._totalPredict(history);
    const oe    = this._oddEvenPredict(history);

    const results = [dice?.result, total?.result, oe?.result].filter(Boolean);
    if (results.length < 2) return 0;

    const tai = results.filter(r => r === 'Tài').length;
    const xiu = results.filter(r => r === 'Xỉu').length;

    // 3/3 đồng thuận
    if (results.length === 3 && (tai === 3 || xiu === 3)) return 80;
    // 2/3 đồng thuận
    if (tai >= 2 || xiu >= 2) return 50;

    return 0;
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
      mode:   'Dice(nearest) + Total(nearest) + OddEven'
    };
  }

  /*─────────────────────────────────────────
    CHI TIẾT
  ─────────────────────────────────────────*/
  duDoanChiTiet(history) {
    if (history.length < 5) return null;

    const dice  = this._dicePredict(history);
    const total = this._totalPredict(history);
    const oe    = this._oddEvenPredict(history);
    const final = this.duDoan(history);
    const conf  = this.calculateConfidence(history);

    const results = [dice?.result, total?.result, oe?.result].filter(Boolean);
    const tai = results.filter(r => r === 'Tài').length;
    const xiu = results.filter(r => r === 'Xỉu').length;

    return {
      // Thuật toán 1: Xúc xắc
      xuc_xac: dice ? {
        d1: `${dice.d1_cur} → ${dice.d1_pred}${dice.d1_at ? ` (phiên -${dice.d1_at})` : ' (fallback)'}`,
        d2: `${dice.d2_cur} → ${dice.d2_pred}${dice.d2_at ? ` (phiên -${dice.d2_at})` : ' (fallback)'}`,
        d3: `${dice.d3_cur} → ${dice.d3_pred}${dice.d3_at ? ` (phiên -${dice.d3_at})` : ' (fallback)'}`,
        tong: dice.tong_du_doan,
        ket_qua: dice.result
      } : 'Không đủ data',

      // Thuật toán 2: Tổng
      tong: total ? {
        tim_tong: total.tong,
        found_at: `phiên -${total.found_at}${total.approx ? ' (±1)' : ''}`,
        ket_qua:  total.result
      } : 'Không tìm được',

      // Thuật toán 3: Chẵn/Lẻ
      chan_le: oe ? {
        match:     oe.match,
        found_at:  `phiên -${oe.found_at}`,
        next_tong: oe.next_tong,
        chan_le:    oe.chan_le,
        ket_qua:   oe.result
      } : 'Không tìm được',

      // Tổng hợp
      vote:      `Tài: ${tai}/3 | Xỉu: ${xiu}/3`,
      dong_thuan: results.length === 3 && (tai === 3 || xiu === 3) ? '3/3 (80%)' : (tai >= 2 || xiu >= 2) ? '2/3 (50%)' : 'Không đồng thuận',
      du_doan:    final,
      do_tin_cay: conf,

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
