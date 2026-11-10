const express = require("express");
const app = express();
app.use(express.json());

/* ─────────────────── 曼谷时间（UTC+7，无夏令时） ─────────────────── */

// 返回 "YYYY-MM-DD HH:mm:ss"
function getBangkokString(date = new Date()) {
  return date.toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" });
}

// 返回 "2019-10-09T10:33:17.450+07:00"（按规范带毫秒）
function getBangkokDateTime(date = new Date()) {
  const base = getBangkokString(date).replace(" ", "T");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${base}.${ms}+07:00`;
}

// 返回 "20191009T10331700001"：日期 + T + 时间 + 5 位流水
// 规范允许与 transactionId 相同，此处用商户侧唯一号
let billerTxnSeq = 0;
function getBillerTransactionId(date = new Date()) {
  const base = getBangkokString(date);
  const ymd = base.slice(0, 10).replace(/-/g, "");
  const hms = base.slice(11, 19).replace(/:/g, "");
  billerTxnSeq = (billerTxnSeq % 99999) + 1;
  return `${ymd}T${hms}${String(billerTxnSeq).padStart(5, "0")}`;
}

/* ─────────────────────── 场景字典 ───────────────────────
 * transactionId -> 返回结果
 * 注意：transactionId 必须按字符串传入，26 位数字会超出 JS 安全整数范围而丢精度
 * 未在表中列出的 transactionId 一律返回成功（保持原有行为）
 */
const RESULT_MAP = {
  // ── 普通 Inquiry ──────────────────────────────────────────
  // Inquiry Already Paid（规范表：0002 / "Already paid"）
  "98099310720200530183382101": { responseCode: "0002", responseDescription: "Already paid" },
  // Inquiry Invalid Ref 1（规范表：0001 / "Invalid Payment reference number"）
  "98099310720200530183382102": {
    responseCode: "0001",
    responseDescription: "Invalid Payment reference number"
  },
  // Inquiry Invalid Ref 1 and 2（规范表：0001 / "Invalid Payment reference number"）
  "98099310720200530183382103": {
    responseCode: "0001",
    responseDescription: "Invalid Payment reference number"
  },
  // Inquiry Invalid Amount（规范表：0004 / "Invalid payment amount"）
  "98099310720200530183382104": {
    responseCode: "0004",
    responseDescription: "Invalid payment amount"
  },
  // Inquiry Other Merchant Error（规范表：1000 / 空描述）
  "98099310720200530183382105": { responseCode: "1000", responseDescription: "Other Merchant Error" },

  // Inquiry Info EN Language（规范表：0000 / Success，info 仅英文）
  // info1 = Customer Name，info2 = Product Information，info3 = Other Information
  "98099310720200530183382106": {
    responseCode: "0000",
    responseDescription: "Success",
    info1: "John Doe",
    info2: "Car Loan Installment",
    info3: "Please pay before due date"
  },
  // Inquiry Info TH Language（规范表：0000 / Success，info 仅泰文）
  // 注意：描述仍是英文 "Success"，只有 info 字段用泰文
  "98099310720200530183382107": {
    responseCode: "0000",
    responseDescription: "Success",
    info1: "จอห์น โด",
    info2: "ค่างวดรถยนต์",
    info3: "กรุณาชำระก่อนวันครบกำหนด"
  },
  // Inquiry Reference 1 for return Reference 2 and amount Success
  // 只传 reference1；响应回填固定 reference2 与金额
  "97999311020200530183382108": {
    responseCode: "0000",
    responseDescription: "Success",
    reference2: "999990045751",
    tranAmount: "120.00"
  },
  // Free Form Success
  // 采用 Free Form 结构：functionName 为 "BILLookupResponse"，
  // 且同时带 promptPayTransactionId / typeofReceiver / tranAmount
  "97999311020200530183382100": {
    freeForm: true,
    functionName: "BillLookupResponse",
    responseCode: "0000",
    responseDescription: "Success"
  },

  // ── PromptPay Inquiry ─────────────────────────────────────
  // PromptPay 响应比普通 Inquiry 多两个字段，插在 terminalNo 与 reference1 之间：
  //   promptPayTransactionId（回显请求）、typeofReceiver（固定 "C"）
  // PromptPay Inquiry Success
  "KBNK_20191009_000000000000100": {
    promptPay: true,
    responseCode: "0000",
    responseDescription: "Success"
  },
  // PromptPay Inquiry Already Paid
  "KBNK_20191009_000000000000101": {
    promptPay: true,
    responseCode: "0002",
    responseDescription: "Already paid"
  },
  // PromptPay Inquiry Invalid Ref 1
  "KBNK_20191009_000000000000102": {
    promptPay: true,
    responseCode: "0001",
    responseDescription: "Invalid Payment reference number"
  },
  // PromptPay Inquiry Invalid Ref 1 and 2
  "KBNK_20191009_000000000000103": {
    promptPay: true,
    responseCode: "0001",
    responseDescription: "Invalid Payment reference number"
  },
  // PromptPay Inquiry Invalid Amount
  "KBNK_20191009_000000000000104": {
    promptPay: true,
    responseCode: "0004",
    responseDescription: "Invalid payment amount"
  },
  // PromptPay Inquiry Other Merchant Error
  "KBNK_20191009_000000000000105": {
    promptPay: true,
    responseCode: "1000",
    responseDescription: "Other Merchant Error"
  }
};

/* 响应字段顺序（严格按规范表）
 * - tranAmount 位于 reference2 与 info1 之间，仅在需要金额的场景出现
 * - promptPayTransactionId / typeofReceiver 位于 terminalNo 与 reference1 之间，
 *   仅 PromptPay 场景出现
 */
const FIELD_ORDER = [
  "functionName",
  "transactionId",
  "transactionDateTime",
  "billerTransactionId",
  "responseCode",
  "responseDescription",
  "billerType",
  "billerId",
  "terminalNo",
  "promptPayTransactionId",
  "typeofReceiver",
  "reference1",
  "reference2",
  "tranAmount",
  "info1",
  "info2",
  "info3"
];

const DEFAULT_RESULT = {
  responseCode: "0000",
  responseDescription: "Success"
};

/* ─────────────────────── Payment ───────────────────────
 * 依据「Exercise: BillPayment Response」规范：
 * - HTTP 状态码必须 200
 * - functionName 固定 "BillPaymentResponse"
 * - 时间字段名为 responseDateTime（与 Inquiry 的 transactionDateTime 不同），须为当天
 * - responseCode / responseDescription 按场景，默认 "0000" / "Success"
 * - terminalNo 固定 "xxxxxxx8888"
 * - Inquiry Additional: rsAppId 固定 ""
 *
 * 场景字典：暂沿用 Inquiry 的 transactionId 与码值，待 Payment 专属场景文档补充后覆盖。
 */
const PAYMENT_CORE_FIELDS = [
  "functionName",
  "transactionId",
  "responseDateTime",
  "billerTransactionId",
  "responseCode",
  "responseDescription",
  "terminalNo"
];

// payment 的三种响应形态
const PAYMENT_VARIANTS = {
  // Exercise: BillPayment Response —— Additional 仅 rsAppId，terminalNo 固定
  billPayment: {
    fields: [...PAYMENT_CORE_FIELDS, "rsAppId"],
    echoTerminalNo: false
  },
  // Exercise: Payment Response —— Additional 为 settlementDate + rsAppId
  payment: {
    fields: [...PAYMENT_CORE_FIELDS, "settlementDate", "rsAppId"],
    echoTerminalNo: false
  },
  // PromptPay 版 BillPayment —— terminalNo 回显请求值，多 promptPayTransactionId
  billPaymentPromptPay: {
    fields: [
      ...PAYMENT_CORE_FIELDS,
      "promptPayTransactionId",
      "settlementDate",
      "rsAppId"
    ],
    echoTerminalNo: true
  }
};

// 按 transactionId 指定响应形态，未列出的走默认（payment）
const PAYMENT_VARIANT_MAP = {
  // BillPayment Response（8 字段）
  "98099310720200530183382100": "billPayment",
  // Payment Response（9 字段）
  "97999311020200530183382100": "payment",
  "97999311020200530183382108": "payment",
  // PromptPay 版 BillPayment（10 字段，terminalNo 回显）
  "KBNK_20191009_000000000000100": "billPaymentPromptPay"
};

const PAYMENT_DEFAULT_RESULT = {
  responseCode: "0000",
  responseDescription: "Success"
};

const PAYMENT_RESULT_MAP = Object.fromEntries(
  Object.entries(RESULT_MAP).map(([id, { functionName, ...rest }]) => [
    id,
    {
      responseCode: rest.responseCode,
      responseDescription: rest.responseDescription
    }
  ])
);

/* 统一构造响应报文
 * - 字段顺序由 FIELD_ORDER 决定，值为 undefined 的字段跳过
 * - promptPay / freeForm / payment 三种结构标记决定附加字段的取舍
 */
function buildResponsePayload(body, result, fallbackFunctionName) {
  const {
    transactionId,
    billerType,
    billerId,
    terminalNo,
    reference1,
    reference2
  } = body;

  // 取出返回码与描述，其余字段作为附加字段覆盖基础值
  const {
    responseCode,
    responseDescription,
    promptPay,
    freeForm,
    functionName: respFunctionName,
    ...extra
  } = result;

  // Free Form 使用完整字段结构
  const fullForm = Boolean(freeForm);

  // 单次取时间，保证 transactionDateTime 与 billerTransactionId 秒级一致
  const now = new Date();

  const values = {
    functionName: respFunctionName || fallbackFunctionName,
    transactionId,
    transactionDateTime: getBangkokDateTime(now),
    billerTransactionId: getBillerTransactionId(now),
    responseCode,
    responseDescription,
    billerType,
    billerId,
    terminalNo,
    // PromptPay / 完整结构：请求字段名为 promptPayReferenceNumber，
    // 响应字段名为 promptPayTransactionId；收款方类型固定 "C"
    ...(promptPay || fullForm
      ? {
          promptPayTransactionId:
            body.promptPayReferenceNumber ?? body.promptPayTransactionId,
          typeofReceiver: "C"
        }
      : {}),
    // 完整结构额外回显 tranAmount
    ...(fullForm ? { tranAmount: body.tranAmount } : {}),
    reference1,
    reference2,
    info1: "",
    info2: "",
    info3: "",
    ...extra
  };

  // PromptPay 响应不返回 info1~3
  if (promptPay) {
    delete values.info1;
    delete values.info2;
    delete values.info3;
  }

  // 按规范顺序装配
  const payload = {};
  for (const key of FIELD_ORDER) {
    if (values[key] !== undefined) payload[key] = values[key];
  }
  // 规范外的附加字段追加到末尾
  for (const key of Object.keys(values)) {
    if (!(key in payload) && values[key] !== undefined) payload[key] = values[key];
  }

  return payload;
}

// 账单查询
app.post("/test/inquiry", (req, res) => {
  const body = req.body || {};
  const result = RESULT_MAP[body.transactionId] || DEFAULT_RESULT;
  res.json(buildResponsePayload(body, result, "BillLookupResponse"));
});

/* 构造 BillPayment 响应报文
 * 形态由 PAYMENT_VARIANT_MAP 决定，规范外的字段一律不返回
 */
function buildPaymentPayload(body, result) {
  const now = new Date();

  const variant =
    PAYMENT_VARIANTS[PAYMENT_VARIANT_MAP[body.transactionId]] ||
    PAYMENT_VARIANTS.payment;

  const values = {
    functionName: "BillPaymentResponse",
    transactionId: body.transactionId,
    responseDateTime: getBangkokDateTime(now),
    billerTransactionId: getBillerTransactionId(now),
    responseCode: result.responseCode,
    responseDescription: result.responseDescription,
    // 部分形态要求回显请求的 terminalNo，其余形态固定
    terminalNo: variant.echoTerminalNo ? body.terminalNo : "xxxxxxx8888",
    // 请求字段名为 promptPayReferenceNumber，响应字段名为 promptPayTransactionId
    promptPayTransactionId:
      body.promptPayReferenceNumber ?? body.promptPayTransactionId,
    // Additional：均固定空串
    settlementDate: "",
    rsAppId: ""
  };

  const payload = {};
  for (const key of variant.fields) {
    if (values[key] !== undefined) payload[key] = values[key];
  }
  return payload;
}

// 账单支付
app.post("/test/payment", (req, res) => {
  const body = req.body || {};
  const result = PAYMENT_RESULT_MAP[body.transactionId] || PAYMENT_DEFAULT_RESULT;
  res.json(buildPaymentPayload(body, result));
});

// ✅ Render 关键：绑定 0.0.0.0，读取 $PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("running on port", PORT);
});
