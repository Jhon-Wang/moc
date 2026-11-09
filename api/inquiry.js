export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = req.body;
  const {
    functionName,
    transactionId,
    billType,
    billId,
    terminalId,
    reference1,
    reference2
  } = body;

  // 生成曼谷 UTC+7 时间
  const getBangkokDateTime = () => {
    return new Date()
      .toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" })
      .replace(" ", "T") + "+07:00";
  };

  // 成功响应（完全匹配文档字段）
  const responseBody = {
    functionName: "BillLookUpResponse",
    transactionId: transactionId,
    transactionDateTime: getBangkokDateTime(),
    billerTransactionId: transactionId,
    responseCode: "0000",
    responseDescription: "Success",
    billerType: billType,
    billerId: billId,
    terminalNo: terminalId,
    reference1: reference1,
    reference2: reference2
  };

  return res.status(200).json(responseBody);
}