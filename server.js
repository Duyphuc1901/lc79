const express = require("express");
const axios = require("axios");
const ThuatToan = require("./thuattoan.js");

const app = express();
const PORT = process.env.PORT || 8000;
const POLL_INTERVAL = 5000;
const MAX_HISTORY = 100;

const thuattoan = new ThuatToan();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// ---- State ----
let latest_tx = {
  phien: 0, xuc_xac_1: 0, xuc_xac_2: 0, xuc_xac_3: 0,
  tong: 0, ket_qua: "Chưa có", phien_hien_tai: 0,
  du_doan: "Chưa có dữ liệu", do_tin_cay: 0
};
let latest_md5 = { ...latest_tx };
let history_tx  = [];
let history_md5 = [];
let last_id_tx  = null;
let last_id_md5 = null;

// ---- Helper ----
function parseItem(item) {
  const [d1, d2, d3] = item.dices || [0, 0, 0];
  return {
    phien: item.id,
    hash: item._id || "",
    xuc_xac_1: d1, xuc_xac_2: d2, xuc_xac_3: d3,
    tong: item.point ?? (d1 + d2 + d3),
    ket_qua: item.resultTruyenThong === "TAI" ? "Tài" : "Xỉu",
    phien_hien_tai: item.id + 1,
    du_doan: "Chưa có dữ liệu", do_tin_cay: 0
  };
}

// Thêm phiên mới vào history, đồng thời cập nhật kết quả thực tế
// cho phiên trước (history[0] là phiên cũ nhất vừa push, chưa có ket_qua_thuc_te)
function updateResult(store, history, result) {
  // Phiên vừa có kết quả = result.ket_qua
  // Phiên trước đó (history[0]) đã dự đoán cho phiên này → so sánh
  if (history.length > 0) {
    const prev = history[0];
    if (prev.du_doan && prev.du_doan !== "Chưa có dữ liệu" && prev.du_doan !== "Không rõ") {
      prev.ket_qua_thuc_te = result.ket_qua;
      prev.status = prev.du_doan === result.ket_qua ? "✅" : "❌";
    }
  }

  // Pattern Memory học từ phiên mới
  thuattoan.hocTuPhien([result, ...history]);

  Object.assign(store, result);
  history.unshift({ ...result });
  if (history.length > MAX_HISTORY) history.pop();
}

// ---- Load history khi khởi động ----
async function loadHistory(url, isMd5) {
  const label = isMd5 ? "[MD5]" : "[TX]";
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Node-Proxy/1.0" },
      timeout: 10000
    });
    const list = data?.list || data?.data?.list || [];
    if (!list.length) return;

    const history = isMd5 ? history_md5 : history_tx;
    const items = list.slice(0, MAX_HISTORY).reverse(); // cũ → mới

    for (let i = 0; i < items.length; i++) {
      const parsed = parseItem(items[i]);
      // Tính du_doan cho phiên này dựa trên các phiên trước đó
      parsed.du_doan    = history.length >= 8 ? thuattoan.duDoan(history) : "Chưa có dữ liệu";
      parsed.do_tin_cay = history.length >= 8 ? thuattoan.calculateConfidence(history) : 0;

      // So sánh du_doan của phiên trước với ket_qua phiên hiện tại
      if (history.length > 0) {
        const prev = history[0];
        if (prev.du_doan && prev.du_doan !== "Chưa có dữ liệu" && prev.du_doan !== "Không rõ") {
          prev.ket_qua_thuc_te = parsed.ket_qua;
          prev.status = prev.du_doan === parsed.ket_qua ? "✅" : "❌";
        }
      }

      thuattoan.hocTuPhien([parsed, ...history]);
      history.unshift(parsed);
    }

    // Cập nhật latest
    const latest = history[0];
    if (isMd5) { Object.assign(latest_md5, latest); last_id_md5 = latest.phien; }
    else        { Object.assign(latest_tx,  latest); last_id_tx  = latest.phien; }

    console.log(`${label} Đã load ${history.length} phiên. Dự đoán: ${latest.du_doan} (${latest.do_tin_cay}%)`);
  } catch (err) {
    console.error(`${label} Lỗi load history:`, err.message);
  }
}

// ---- Poll ----
async function pollAPI(url, isMd5) {
  const label = isMd5 ? "[MD5]" : "[TX]";
  while (true) {
    try {
      const { data } = await axios.get(url, {
        headers: { "User-Agent": "Node-Proxy/1.0" },
        timeout: 10000
      });

      const list = data?.list || data?.data?.list || [];
      if (!list.length) throw new Error("Không có dữ liệu list");

      const latest = list[0];
      const sid    = latest.id;
      const hash   = latest._id || "";
      const [d1, d2, d3] = latest.dices || [0, 0, 0];
      const tong    = latest.point ?? (d1 + d2 + d3);
      const ket_qua = latest.resultTruyenThong === "TAI" ? "Tài" : "Xỉu";

      const history = isMd5 ? history_md5 : history_tx;
      const lastId  = isMd5 ? last_id_md5  : last_id_tx;

      if (sid && sid !== lastId) {
        if (isMd5) last_id_md5 = sid; else last_id_tx = sid;

        const du_doan    = thuattoan.duDoan(history);
        const do_tin_cay = thuattoan.calculateConfidence(history);

        const result = {
          phien: sid, hash,
          xuc_xac_1: d1, xuc_xac_2: d2, xuc_xac_3: d3,
          tong, ket_qua,
          phien_hien_tai: sid + 1,
          du_doan, do_tin_cay
        };

        if (isMd5) updateResult(latest_md5, history_md5, result);
        else       updateResult(latest_tx,  history_tx,  result);

        console.log(`${label} Phiên ${sid} | ${ket_qua} | Dự đoán tiếp: ${du_doan} (${do_tin_cay}%)`);
      }
    } catch (err) {
      console.error(`${label} Lỗi:`, err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

// ---- Routes ----
app.get("/api/taixiu",    (req, res) => res.json(latest_tx));
app.get("/api/taixiumd5", (req, res) => res.json(latest_md5));

// History với đối chiếu kết quả thực tế + xúc xắc
app.get("/api/history", (req, res) => {
  const format = (h) => ({
    phien_hien_tai:  h.phien_hien_tai,
    xuc_xac_1:       h.xuc_xac_1,
    xuc_xac_2:       h.xuc_xac_2,
    xuc_xac_3:       h.xuc_xac_3,
    tong:            h.tong,
    ket_qua:         h.ket_qua,
    du_doan:         h.du_doan,
    ket_qua_thuc_te: h.ket_qua_thuc_te || "Chờ kết quả...",
    status:          h.status          || "⏳",
    do_tin_cay:      h.do_tin_cay
  });

  res.json({
    taixiu:    history_tx.map(format),
    taixiumd5: history_md5.map(format)
  });
});

app.get("/api/detail", (req, res) => {
  res.json({
    taixiu:    thuattoan.duDoanChiTiet(history_tx),
    taixiumd5: thuattoan.duDoanChiTiet(history_md5)
  });
});

app.get("/", (req, res) => res.send(
  "LC79 TaiXiu API | /api/taixiu | /api/taixiumd5 | /api/history | /api/detail"
));

// ---- Start ----
(async () => {
  console.log("Khởi động LC79 Tài Xỉu API...");
  await Promise.all([
    loadHistory("https://wtx.tele68.com/v1/tx/sessions",        false),
    loadHistory("https://wtxmd52.tele68.com/v1/txmd5/sessions", true)
  ]);
  console.log("History sẵn sàng. Bắt đầu polling...");
  pollAPI("https://wtx.tele68.com/v1/tx/sessions",        false);
  pollAPI("https://wtxmd52.tele68.com/v1/txmd5/sessions", true);
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
