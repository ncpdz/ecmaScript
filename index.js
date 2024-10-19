const express = require("express");
const csvParser = require("csv-parser");
const fs = require("fs");
const mysql = require("mysql2/promise");
const path = require("path");
const fileUpload = require("express-fileupload");
const util = require("util");
const app = express();
const stream = require("stream");

app.use(fileUpload());
app.use(
  "/bootstrap/css",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/css"))
);
app.use(
  "/bootstrap/js",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/js"))
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "phi171102",
  database: "asmecma",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to MySQL");
    connection.release();
  } catch (err) {
    console.error("Unable to connect to MySQL:", err);
  }
})();

function buildFilterConditions(queryParams) {
  const { startDate, endDate, minAmount, maxAmount, detail } = queryParams;
  const conditions = [];
  const values = [];

  if (startDate) {
    conditions.push("date_time >= ?");
    values.push(startDate);
  }

  if (endDate) {
    conditions.push("date_time <= ?");
    values.push(endDate);
  }

  if (minAmount) {
    const parsedMinAmount = parseFloat(minAmount); // Chuyển minAmount thành số
    if (!isNaN(parsedMinAmount)) {
      conditions.push("credit >= ?");
      values.push(parsedMinAmount);
    }
  }

  if (maxAmount) {
    const parsedMaxAmount = parseFloat(maxAmount); // Chuyển maxAmount thành số
    if (!isNaN(parsedMaxAmount)) {
      conditions.push("credit <= ?");
      values.push(parsedMaxAmount);
    }
  }

  if (detail) {
    conditions.push("detail LIKE ?");
    values.push(`%${detail}%`);
  }

  return { conditions, values };
}

app.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      detail,
      uploadTime,
    } = req.query;

    const currentPage = parseInt(page, 10) || 1;
    const limit = 50;
    const offset = (currentPage - 1) * limit;

    // Build the WHERE clause and corresponding values
    const { conditions, values } = buildFilterConditions(req.query);
    let whereClause = "";
    if (conditions.length > 0) {
      whereClause = " WHERE " + conditions.join(" AND ");
    }

    // Query data
    const dataQuery = `
      SELECT date_time, credit, detail
      FROM chuyenkhoan
      ${whereClause}
      ORDER BY date_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [results] = await pool.execute(dataQuery, values);

    const formattedResults = results.map((transaction) => {
      const originalDateTime = new Date(transaction.date_time);
      const formattedDateTime = `${String(originalDateTime.getDate()).padStart(
        2,
        "0"
      )}/${String(originalDateTime.getMonth() + 1).padStart(
        2,
        "0"
      )}/${originalDateTime.getFullYear()} ${String(
        originalDateTime.getHours()
      ).padStart(2, "0")}:${String(originalDateTime.getMinutes()).padStart(
        2,
        "0"
      )}:${String(originalDateTime.getSeconds()).padStart(2, "0")}`;
      return {
        ...transaction,
        date_time: formattedDateTime,
      };
    });

    // Query to count total filtered records
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM chuyenkhoan
      ${whereClause}
    `;
    const [countResults] = await pool.execute(countQuery, values);
    const total = countResults[0].total;
    const totalPages = Math.ceil(total / limit);

    res.render("pages/index", {
      transactions: formattedResults,
      page: currentPage,
      totalPages,
      startDate: startDate || "",
      endDate: endDate || "",
      minAmount: minAmount || "",
      maxAmount: maxAmount || "",
      detail: detail || "",
      uploadTime: uploadTime || "", 
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/upload", async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send("No files were uploaded.");
    }

    const csvFile = req.files.csvFile;

    // Chuyển đổi file buffer thành Readable stream
    const bufferStream = new stream.PassThrough();
    bufferStream.end(csvFile.data);

    const transactions = [];

    // Đọc và phân tích file CSV từ buffer
    await new Promise((resolve, reject) => {
      bufferStream
        .pipe(csvParser())
        .on("data", (row) => {
          // Xử lý các trường có dấu ngoặc kép trong tên cột
          const cleanRow = {};
          for (let key in row) {
            const cleanedKey = key.replace(/"/g, "").trim(); // Loại bỏ dấu ngoặc kép
            cleanRow[cleanedKey] = row[key];
          }

          const { date_time, trans_no, credit, debit, detail } = cleanRow;

          // Kiểm tra dữ liệu và xử lý định dạng của cột date_time
          if (date_time && date_time.includes("_")) {
            const cleanDateTime = date_time.replace(/"/g, "").trim();
            const [date, seconds] = cleanDateTime.split("_");

            const [day, month, year] = date.split("/");
            const totalSeconds = Math.floor(parseFloat(seconds));
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const remainingSeconds = totalSeconds % 60;

            const formattedTime = `${String(hours).padStart(2, "0")}:${String(
              minutes
            ).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
            const formattedDateTime = `${year}-${String(month).padStart(
              2,
              "0"
            )}-${String(day).padStart(2, "0")} ${formattedTime}`;

            transactions.push([
              formattedDateTime,
              trans_no.trim(),
              parseFloat(credit.trim()) || 0,
              parseFloat(debit.trim()) || 0,
              detail.trim(),
            ]);
          } else {
            console.error(
              `Invalid or missing date_time in row: ${JSON.stringify(cleanRow)}`
            );
          }
        })
        .on("end", () => {
          console.log("CSV file successfully processed");
          resolve();
        })
        .on("error", (error) => {
          console.error("Error reading the CSV file:", error);
          reject(error);
        });
    });

    console.log("Transactions to save:", transactions);

    // Start measuring insertion time
    const insertionStartTime = Date.now();

    // Batch insert các giao dịch vào cơ sở dữ liệu theo từng nhóm nhỏ
    if (transactions.length > 0) {
      const batchSize = 100; // Số lượng batch
      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        const placeholders = batch.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const insertQuery = `
          INSERT INTO chuyenkhoan (date_time, trans_no, credit, debit, detail)
          VALUES ${placeholders}
        `;

        const flattenedValues = batch.flat();

        await pool.execute(insertQuery, flattenedValues);
      }
    }

    // End measuring insertion time
    const insertionEndTime = Date.now();
    const timeTakenSeconds = (
      (insertionEndTime - insertionStartTime) /
      1000
    ).toFixed(2);

    console.log("All transactions saved to the database");
    console.log(`Insertion Time: ${timeTakenSeconds} seconds`);

    // Redirect về trang chính với thời gian chèn vào MySQL
    res.redirect(`/?uploadTime=${timeTakenSeconds}`);
  } catch (err) {
    console.error("Error saving transactions to database:", err);
    res.status(500).send("Internal Server Error");
  }
});

const port = 3002;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
