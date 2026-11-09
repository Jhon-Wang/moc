export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const body = req.body;
  const {
    functionName,
    transactionId,
    transactionDateTime,
    billType,
    billId,
    terminalId,
    tranAmount,
    reference1,
    reference2,
    language = "EN"
  } = body;

  // 沙盒文档标准合法账单
  const validRef1 = "000000025781";
  const validRef2 = "1723366";
  const validAmt = "120.00";

  let responseCode = "9999";
  let responseDescription = "Unknown error";

  if (functionName !== "BILLLOOKUP") {
    responseCode = "9001";
    responseDescription = "Invalid functionName";
  } else if (reference1 === validRef1 && reference2 === validRef2) {
    if (tranAmount === validAmt) {
      // ✅ Inquiry Success 标准成功场景
      responseCode = "0000";
      responseDescription = language === "TH" ? "สำเร็จ" : "Success";
    } else {
      // 金额不匹配
      responseCode = "0001";
      responseDescription = language === "TH" ? "จำนวนเงินไม่ถูกต้อง" : "Invalid Amount";
    }
  } else if (reference1 === "PAID-REF") {
    // 账单已支付
    responseCode = "0004";
    responseDescription = language === "TH" ? "บิลได้รับชำระแล้ว" : "Already Paid";
  } else {
    // 参考单号不存在
    responseCode = "0002";
    responseDescription = language === "TH" ? "ไม่พบข้อมูลอ้างอิง" : "Invalid Reference";
  }

  // 生成泰国曼谷时区 UTC+7 时间，规避 wrong transactionDate time
  const thTime = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" })
    .replace(" ", "T") + "+07:00";

  const resp = {
    functionName: "BillLookUpResponse",
    transactionId,
    transactionDateTime: thTime,
    billReference: `${reference1}-${reference2}`,
    billTransactionId: `MER-${transactionId}`,
    responseCode,
    responseDescription,
    billType,
    billId,
    terminalId,
    reference1,
    reference2,
    info1: "",
    info2: "",
    info3: ""
  };
  return res.status(200).json(resp);
}