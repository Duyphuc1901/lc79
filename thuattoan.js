/**
 * PATTERN MEMORY ENGINE
 * ─────────────────────
 * Ghi nhớ mọi pattern đã thấy theo 4 chiều:
 *  - Chuỗi kết quả bậc 2-5
 *  - Zone tổng điểm bậc 1-3
 *  - Combo (kết quả + zone) bậc 2-3
 *  - Thông tin cầu hiện tại
 *
 * Mỗi pattern tự cập nhật sau mỗi phiên thực tế.
 * Pattern cũ giảm ảnh hưởng theo thời gian (decay).
 * Khi predict: tổng hợp tất cả pattern khớp → weighted vote.
 * Chỉ tin khi confidence cao → khi thấp dùng fallback Freq8.
 */
class ThuatToanB52 {

  constructor() {
    this.mem   = {}; // pattern memory
    this.decay = 0.97;
    this.phien = 0;
  }

  getTaiXiu(d1, d2, d3) {
    return (d1 + d2 + d3) <= 10 ? 'Xỉu' : 'Tài';
  }

  /*─────────────────────────────────────────
    ZONE — phân loại tổng điểm
  ─────────────────────────────────────────*/
  _zone(t) {
    if (t <= 7)          return 'L';  // Low  ≤7
    if (t >= 8 && t<=10) return 'M';  // Mid  8-10
    if (t>=11 && t<=12)  return 'H';  // High 11-12
    return 'X';                        // eXtreme ≥13
  }

  /*─────────────────────────────────────────
    THÔNG TIN CẦU — encode thành key
  ─────────────────────────────────────────*/
  _cauKey(seq) {
    if (seq.length < 4) return null;
    const caus = [];
    let cur = seq[0], len = 1;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === cur) len++;
      else { caus.push({ v: cur, l: len }); cur = seq[i]; len = 1; }
    }
    caus.push({ v: cur, l: len });

    const same = caus.slice(1).filter(c => c.v === caus[0].v);
    if (same.length < 3) return null;

    const avg     = same.reduce((s, c) => s + c.l, 0) / same.length;
    const lenCat  = caus[0].l >= avg * 1.3 ? 'LONG'
                  : caus[0].l <= avg * 0.6 ? 'SHORT'
                  : 'AVG';
    return caus[0].v[0] + '_' + lenCat; // e.g. "T_LONG", "X_SHORT"
  }

  /*─────────────────────────────────────────
    TẠO TẤT CẢ KEYS cho trạng thái hiện tại
  ─────────────────────────────────────────*/
  _makeKeys(seq, tng) {
    const keys = [];

    // 1. Pattern chuỗi kết quả bậc 2-5
    for (const d of [2, 3, 4, 5]) {
      if (seq.length >= d) {
        keys.push({ key: 'S' + d + '_' + seq.slice(0, d).join(''), w: d });
      }
    }

    // 2. Pattern zone tổng bậc 1-3
    const zones = tng.slice(0, 3).map(t => this._zone(t));
    for (const d of [1, 2, 3]) {
      if (zones.length >= d) {
        keys.push({ key: 'Z' + d + '_' + zones.slice(0, d).join(''), w: d * 0.8 });
      }
    }

    // 3. Pattern combo kết quả + zone bậc 2-3
    for (const d of [2, 3]) {
      if (seq.length >= d && tng.length >= d) {
        const combo = seq.slice(0, d)
          .map((s, i) => s[0] + this._zone(tng[i]))
          .join('');
        keys.push({ key: 'C' + d + '_' + combo, w: d * 1.2 });
      }
    }

    // 4. Cầu key
    const ck = this._cauKey(seq);
    if (ck) keys.push({ key: 'CAU_' + ck, w: 2 });

    return keys;
  }

  /*─────────────────────────────────────────
    HỌC — cập nhật memory sau mỗi phiên thực tế
    Gọi hàm này mỗi khi có kết quả mới
  ─────────────────────────────────────────*/
  hocTuPhien(history) {
    // history[0] = phiên mới nhất đã có kết quả
    // Học: trạng thái [1..] → kết quả [0]
    if (history.length < 6) return;

    this.phien++;
    const seq    = history.map(h => h.ket_qua);
    const tng    = history.map(h => h.tong);
    const actual = seq[0]; // kết quả phiên vừa xong

    // Context = trạng thái từ phiên thứ 1 trở đi
    const ctxSeq = seq.slice(1);
    const ctxTng = tng.slice(1);
    const keys   = this._makeKeys(ctxSeq, ctxTng);

    for (const { key, w } of keys) {
      if (!this.mem[key]) {
        this.mem[key] = { tai: 0, xiu: 0, lastSeen: this.phien };
      }
      const entry = this.mem[key];

      // Decay theo thời gian
      const gap = this.phien - entry.lastSeen;
      if (gap > 0) {
        const df = Math.pow(this.decay, gap);
        entry.tai  *= df;
        entry.xiu  *= df;
      }

      if (actual === 'Tài') entry.tai += w;
      else                   entry.xiu += w;
      entry.lastSeen = this.phien;
    }
  }

  /*─────────────────────────────────────────
    DỰ ĐOÁN — tổng hợp tất cả pattern khớp
  ─────────────────────────────────────────*/
  duDoan(history) {
    if (history.length < 8) return 'Chưa có dữ liệu';

    const seq  = history.map(h => h.ket_qua);
    const tng  = history.map(h => h.tong);
    const keys = this._makeKeys(seq, tng);

    let totalScore = 0;
    let matched    = 0;

    for (const { key, w } of keys) {
      const entry = this.mem[key];
      if (!entry) continue;

      const total = entry.tai + entry.xiu;
      if (total < 3) continue; // cần đủ mẫu

      const pTai = entry.tai / total;
      const conf = Math.abs(pTai - 0.5);
      if (conf < 0.1) continue; // quá cân bằng → bỏ

      // Vote: hướng × confidence × weight × log(count)
      const vote = (pTai - 0.5) * 2 * w * conf * Math.log(total + 1);
      totalScore += vote;
      matched++;
    }

    // Không đủ pattern → fallback Freq8
    if (matched === 0 || Math.abs(totalScore) < 0.3) {
      const r   = seq.slice(0, 8);
      const tai = r.filter(v => v === 'Tài').length;
      return tai > 4 ? 'Tài' : 'Xỉu';
    }

    return totalScore >= 0 ? 'Tài' : 'Xỉu';
  }

  /*─────────────────────────────────────────
    CONFIDENCE — dựa trên độ mạnh của signal
  ─────────────────────────────────────────*/
  calculateConfidence(history) {
    if (history.length < 8) return 0;

    const seq  = history.map(h => h.ket_qua);
    const tng  = history.map(h => h.tong);
    const keys = this._makeKeys(seq, tng);

    let totalScore = 0, matched = 0, totalConf = 0;

    for (const { key, w } of keys) {
      const entry = this.mem[key];
      if (!entry) continue;
      const total = entry.tai + entry.xiu;
      if (total < 3) continue;
      const pTai = entry.tai / total;
      const conf = Math.abs(pTai - 0.5);
      if (conf < 0.1) continue;
      totalScore += (pTai - 0.5) * 2 * w * conf;
      totalConf  += conf * w;
      matched++;
    }

    if (matched === 0) return 0;
    return Math.min(99, Math.round((totalConf / matched) * 150));
  }

  /*─────────────────────────────────────────
    CHI TIẾT — debug patterns đang khớp
  ─────────────────────────────────────────*/
  duDoanChiTiet(history) {
    if (history.length < 8) return null;

    const seq  = history.map(h => h.ket_qua);
    const tng  = history.map(h => h.tong);
    const keys = this._makeKeys(seq, tng);

    const active = [];
    let totalScore = 0;

    for (const { key, w } of keys) {
      const entry = this.mem[key];
      if (!entry) continue;
      const total = entry.tai + entry.xiu;
      if (total < 3) continue;
      const pTai = entry.tai / total;
      const conf = Math.abs(pTai - 0.5);
      if (conf < 0.1) continue;
      const vote = (pTai - 0.5) * 2 * w * conf * Math.log(total + 1);
      totalScore += vote;
      active.push({
        pattern: key,
        tai_pct: Math.round(pTai * 100),
        samples: Math.round(total),
        vote:    vote.toFixed(2)
      });
    }

    return {
      total_patterns_learned: Object.keys(this.mem).length,
      active_patterns:        active.length,
      top_patterns:           active.sort((a,b)=>Math.abs(b.vote)-Math.abs(a.vote)).slice(0,5),
      final_score:            totalScore.toFixed(3),
      ensemble:               this.duDoan(history)
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
