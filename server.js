const express = require("express");
const axios = require("axios");
const ThuatToan = require("./thuattoan.js");

const app = express();
const PORT = process.env.PORT || 8000;
const POLL_INTERVAL = 5000;
const MAX_HISTORY = 50;

const thuattoan = new ThuatToan();

// CORS cho phép frontend gọi từ bất kỳ đâu
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
function updateResult(store, history, result) {
  Object.assign(store, result);
  history.unshift({ ...result });
  if (history.length > MAX_HISTORY) history.pop();
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

      // Phiên mới nhất là index 0
      const latest = list[0];
      const sid  = latest.id;
      const hash = latest._id || "";
      const [d1, d2, d3] = latest.dices || [0, 0, 0];
      const tong     = latest.point ?? (d1 + d2 + d3);
      const ket_qua  = latest.resultTruyenThong === "TAI" ? "Tài" : "Xỉu";

      const history  = isMd5 ? history_md5 : history_tx;
      const lastId   = isMd5 ? last_id_md5  : last_id_tx;

      if (sid && sid !== lastId) {
        if (isMd5) last_id_md5 = sid; else last_id_tx = sid;

        const du_doan    = thuattoan.duDoan(history);
        const do_tin_cay = thuattoan.calculateConfidence(history, du_doan);

        const result = {
          phien: sid, hash,
          xuc_xac_1: d1, xuc_xac_2: d2, xuc_xac_3: d3,
          tong, ket_qua,
          phien_hien_tai: sid + 1,
          du_doan, do_tin_cay
        };

        if (isMd5) updateResult(latest_md5, history_md5, result);
        else       updateResult(latest_tx,  history_tx,  result);

        console.log(`${label} Phiên ${sid} | ${d1}+${d2}+${d3}=${tong} | ${ket_qua} | Dự đoán: ${du_doan} (${do_tin_cay}%)`);
      }
    } catch (err) {
      console.error(`${label} Lỗi:`, err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

// ---- Routes ----
app.get("/api/taixiu", (req, res) => res.json(latest_tx));
app.get("/api/taixiumd5", (req, res) => res.json(latest_md5));
app.get("/api/history", (req, res) => res.json({ taixiu: history_tx, taixiumd5: history_md5 }));
app.get("/", (req, res) => res.send("LC79 TaiXiu API đang chạy. Endpoints: /api/taixiu | /api/taixiumd5 | /api/history"));

// ---- Start ----
console.log("Khởi động LC79 Tài Xỉu API...");
pollAPI("https://wtx.tele68.com/v1/tx/sessions",       false);
pollAPI("https://wtxmd52.tele68.com/v1/txmd5/sessions", true);
console.log("Đang polling dữ liệu từ lc79...");

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
