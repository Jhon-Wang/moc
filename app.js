const express = require("express");
const app = express();
app.use(express.json());

// 曼谷 UTC+7
function getBangkokDateTime() {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" })
    .replace(" ", "T") + "+07:00";
}

app.post("/test/inquiry", (req, res) => {
  const body = req.body;
  const {
    transactionId,
    billType,
    billId,
    terminalId,
    reference1,
    reference2
  } = body;

  res.json({
    functionName: "BillLookupResponse",
    transactionId,
    transactionDateTime: getBangkokDateTime(),
    billerTransactionId: transactionId,
    responseCode: "0000",
    responseDescription: "Success",
    billerType: billType,
    billerId: billId,
    terminalNo: terminalId,
    reference1,
    reference2
  });
});

// ✅ Render 关键：绑定 0.0.0.0，读取 $PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("running on port", PORT);
});
