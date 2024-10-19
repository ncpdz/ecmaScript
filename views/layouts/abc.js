// // index.js
// const express = require("express");
// const csvParser = require("csv-parser");
// const fs = require("fs");
// const mysql = require("mysql2/promise"); // Sử dụng mysql2/promise để hỗ trợ async/await
// const path = require("path");
// const fileUpload = require("express-fileupload");
// const { query, validationResult } = require('express-validator'); // Thêm express-validator
// const app = express();

// // Middleware
// app.use(fileUpload());
// app.use(
//   "/bootstrap/css",
//   express.static(path.join(__dirname, "node_modules/bootstrap/dist/css"))
// );
// app.use(
//   "/bootstrap/js",
//   express.static(path.join(__dirname, "node_modules/bootstrap/dist/js"))
// );
// app.use(express.urlencoded({ extended: true })); // Để xử lý dữ liệu form
// app.use(express.static("public"));

// // Thiết lập EJS
// app.set("view engine", "ejs");
// app.set("views", path.join(__dirname, "views"));

// // Cấu hình MySQL với Connection Pool
// const pool = mysql.createPool({
//   host: "localhost",
//   user: "root",
//   password: "phi171102",
//   database: "asmecma",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });

// // Kiểm tra kết nối
// (async () => {
//   try {
//     const connection = await pool.getConnection();
//     console.log("Connected to MySQL");
//     connection.release();
//   } catch (err) {
//     console.error("Unable to connect to MySQL:", err);
//   }
// })();

// // Helper function để xây dựng điều kiện WHERE dựa trên các bộ lọc
// function buildFilterConditions(queryParams) {
//   const { startDate, endDate, minAmount, maxAmount, detail } = queryParams;
//   const conditions = [];
//   const values = [];

//   if (startDate) {
//     conditions.push("date_time >= ?");
//     values.push(startDate);
//   }

//   if (endDate) {
//     conditions.push("date_time <= ?");
//     values.push(endDate);
//   }

//   if (minAmount) {
//     conditions.push("credit >= ?");
//     values.push(minAmount);
//   }

//   if (maxAmount) {
//     conditions.push("credit <= ?");
//     values.push(maxAmount);
//   }

//   if (detail) {
//     conditions.push("detail LIKE ?");
//     values.push(`%${detail}%`);
//   }

//   return { conditions, values };
// }

// // Route GET '/' với chức năng lọc và phân trang
// app.get(
//   "/",
//   [
//     query('page').optional().isInt({ min: 1 }).toInt(),
//     query('startDate').optional().isISO8601(),
//     query('endDate').optional().isISO8601(),
//     query('minAmount').optional().isFloat({ min: 0 }).toFloat(),
//     query('maxAmount').optional().isFloat({ min: 0 }).toFloat(),
//     query('detail').optional().trim().escape(),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     try {
//       const {
//         page = 1,
//         startDate,
//         endDate,
//         minAmount,
//         maxAmount,
//         detail,
//       } = req.query;

//       // Đảm bảo 'page' là số nguyên
//       const currentPage = parseInt(page, 10) || 1;
//       const limit = 50;
//       const offset = (currentPage - 1) * limit;

//       // Xây dựng điều kiện WHERE và giá trị tương ứng
//       const { conditions, values } = buildFilterConditions(req.query);
//       let whereClause = "";
//       if (conditions.length > 0) {
//         whereClause = " WHERE " + conditions.join(" AND ");
//       }

//       // Xây dựng câu truy vấn dữ liệu
//       const dataQuery = `
//         SELECT date_time, credit, detail
//         FROM chuyenkhoan
//         ${whereClause}
//         ORDER BY date_time DESC
//         LIMIT ${limit} OFFSET ${offset}
//       `;

//       // Thực hiện query dữ liệu
//       const [results] = await pool.execute(dataQuery, values);

//       // Định dạng lại ngày giờ
//       const formattedResults = results.map((transaction) => {
//         const originalDateTime = new Date(transaction.date_time);
//         const formattedDateTime = `${String(originalDateTime.getDate()).padStart(
//           2,
//           "0"
//         )}/${String(originalDateTime.getMonth() + 1).padStart(
//           2,
//           "0"
//         )}/${originalDateTime.getFullYear()} ${String(
//           originalDateTime.getHours()
//         ).padStart(2, "0")}:${String(originalDateTime.getMinutes()).padStart(
//           2,
//           "0"
//         )}:${String(originalDateTime.getSeconds()).padStart(2, "0")}`;
//         return {
//           ...transaction,
//           date_time: formattedDateTime,
//         };
//       });

//       // Query để đếm tổng số bản ghi thỏa mãn điều kiện lọc
//       const countQuery = `
//         SELECT COUNT(*) AS total
//         FROM chuyenkhoan
//         ${whereClause}
//       `;
//       const [countResults] = await pool.execute(countQuery, values);
//       const total = countResults[0].total;
//       const totalPages = Math.ceil(total / limit);

//       res.render("pages/index", {
//         transactions: formattedResults,
//         page: currentPage,
//         totalPages,
//         // Truyền lại các giá trị lọc để giữ lại trong form
//         startDate: startDate || "",
//         endDate: endDate || "",
//         minAmount: minAmount || "",
//         maxAmount: maxAmount || "",
//         detail: detail || "",
//       });
//     } catch (err) {
//       console.error("Error fetching transactions:", err);
//       res.status(500).send("Internal Server Error");
//     }
//   }
// );

// // Route POST '/upload' để xử lý tải lên CSV
// app.post("/upload", async (req, res) => {
//   try {
//     if (!req.files || Object.keys(req.files).length === 0) {
//       return res.status(400).send("No files were uploaded.");
//     }

//     const csvFile = req.files.csvFile;
//     const uploadDir = path.join(__dirname, "uploads");

//     // Tạo thư mục uploads nếu chưa tồn tại
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir);
//     }

//     const filePath = path.join(uploadDir, csvFile.name);

//     // Lưu file CSV lên server
//     await csvFile.mv(filePath);

//     const transactions = [];

//     // Đọc và phân tích file CSV
//     await new Promise((resolve, reject) => {
//       fs.createReadStream(filePath)
//         .pipe(csvParser())
//         .on("data", (row) => {
//           // Xử lý các trường có dấu ngoặc kép trong tên cột
//           const cleanRow = {};
//           for (let key in row) {
//             const cleanedKey = key.replace(/"/g, "").trim(); // Loại bỏ dấu ngoặc kép
//             cleanRow[cleanedKey] = row[key];
//           }

//           const { date_time, trans_no, credit, debit, detail } = cleanRow;

//           // Kiểm tra dữ liệu và xử lý định dạng của cột date_time
//           if (date_time && date_time.includes("_")) {
//             const cleanDateTime = date_time.replace(/"/g, "").trim();
//             const [date, seconds] = cleanDateTime.split("_");

//             const [day, month, year] = date.split("/");
//             const totalSeconds = Math.floor(parseFloat(seconds));
//             const hours = Math.floor(totalSeconds / 3600);
//             const minutes = Math.floor((totalSeconds % 3600) / 60);
//             const remainingSeconds = totalSeconds % 60;

//             const formattedTime = `${String(hours).padStart(2, "0")}:${String(
//               minutes
//             ).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
//             const formattedDateTime = `${year}-${String(month).padStart(
//               2,
//               "0"
//             )}-${String(day).padStart(2, "0")} ${formattedTime}`;

//             transactions.push({
//               date_time: formattedDateTime,
//               trans_no: trans_no.trim(),
//               credit: parseFloat(credit.trim()) || 0,
//               debit: parseFloat(debit.trim()) || 0,
//               detail: detail.trim(),
//             });
//           } else {
//             console.error(
//               `Invalid or missing date_time in row: ${JSON.stringify(cleanRow)}`
//             );
//           }
//         })
//         .on("end", () => {
//           console.log("CSV file successfully processed");
//           resolve();
//         })
//         .on("error", (error) => {
//           console.error("Error reading the CSV file:", error);
//           reject(error);
//         });
//     });

//     console.log("Transactions to save:", transactions);

//     // Sử dụng transactions để chèn dữ liệu
//     const connection = await pool.getConnection();
//     try {
//       await connection.beginTransaction();

//       const insertQuery = `
//         INSERT INTO chuyenkhoan (date_time, trans_no, credit, debit, detail)
//         VALUES (?, ?, ?, ?, ?)
//       `;

//       for (const transaction of transactions) {
//         await connection.execute(insertQuery, [
//           transaction.date_time,
//           transaction.trans_no,
//           transaction.credit,
//           transaction.debit,
//           transaction.detail,
//         ]);
//       }

//       await connection.commit();
//       console.log("All transactions saved to the database");
//     } catch (err) {
//       await connection.rollback();
//       console.error("Error saving transactions to database:", err);
//       return res.status(500).send("Error saving transactions.");
//     } finally {
//       connection.release();
//     }

//     // Xóa file CSV sau khi xử lý xong
//     fs.unlink(filePath, (err) => {
//       if (err) console.error("Error deleting the file:", err);
//     });

//     // Redirect về trang chính sau khi upload thành công
//     res.redirect("/");
//   } catch (err) {
//     console.error("Error processing upload:", err);
//     res.status(500).send("Error processing file.");
//   }
// });

// // Khởi động server
// const PORT = 3002;
// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

// app.js
const express = require("express");
const csvParser = require("csv-parser");
const fs = require("fs");
const mysql = require("mysql2/promise");
const path = require("path");
const fileUpload = require("express-fileupload");
const util = require("util");
const app = express();

// Middleware
app.use(fileUpload());
app.use(
  "/bootstrap/css",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/css"))
);
app.use(
  "/bootstrap/js",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/js"))
);
app.use(express.urlencoded({ extended: true })); // Để xử lý dữ liệu form
app.use(express.static("public"));

// Thiết lập EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Cấu hình MySQL với Connection Pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "phi171102",
  database: "asmecma",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Kiểm tra kết nối
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to MySQL");
    connection.release();
  } catch (err) {
    console.error("Unable to connect to MySQL:", err);
  }
})();

// Helper function để xây dựng điều kiện WHERE dựa trên các bộ lọc
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
    conditions.push("credit >= ?");
    values.push(minAmount);
  }

  if (maxAmount) {
    conditions.push("credit <= ?");
    values.push(maxAmount);
  }

  if (detail) {
    conditions.push("detail LIKE ?");
    values.push(`%${detail}%`);
  }

  return { conditions, values };
}

// Route GET '/' với chức năng lọc và phân trang
app.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      detail,
      uploadTime, // Destructure uploadTime from query parameters
    } = req.query;

    // Đảm bảo 'page' là số nguyên
    const currentPage = parseInt(page, 10) || 1;
    const limit = 50;
    const offset = (currentPage - 1) * limit;

    // Xây dựng điều kiện WHERE và giá trị tương ứng
    const { conditions, values } = buildFilterConditions(req.query);
    let whereClause = "";
    if (conditions.length > 0) {
      whereClause = " WHERE " + conditions.join(" AND ");
    }

    // Xây dựng câu truy vấn dữ liệu
    const dataQuery = `
      SELECT date_time, credit, detail
      FROM chuyenkhoan
      ${whereClause}
      ORDER BY date_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Thực hiện query dữ liệu
    const [results] = await pool.execute(dataQuery, values);

    // Định dạng lại ngày giờ
    const formattedResults = results.map((transaction) => {
      const originalDateTime = new Date(transaction.date_time);
      const formattedDateTime = `${String(originalDateTime.getDate()).padStart(
        2,
        "0"
      )}/${String(originalDateTime.getMonth() + 1).padStart(2, "0")}/${
        originalDateTime.getFullYear()
      } ${String(originalDateTime.getHours()).padStart(2, "0")}:${String(
        originalDateTime.getMinutes()
      ).padStart(2, "0")}:${String(originalDateTime.getSeconds()).padStart(
        2,
        "0"
      )}`;
      return {
        ...transaction,
        date_time: formattedDateTime,
      };
    });

    // Query để đếm tổng số bản ghi thỏa mãn điều kiện lọc
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
      // Truyền lại các giá trị lọc để giữ lại trong form
      startDate: startDate || "",
      endDate: endDate || "",
      minAmount: minAmount || "",
      maxAmount: maxAmount || "",
      detail: detail || "",
      uploadTime: uploadTime || "", // Pass uploadTime to the template
    });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Route POST '/upload' để xử lý tải lên CSV
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send("No files were uploaded.");
    }

    const csvFile = req.files.csvFile;
    const uploadDir = path.join(__dirname, "uploads");

    // Tạo thư mục uploads nếu chưa tồn tại
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    const filePath = path.join(uploadDir, csvFile.name);

    // Lưu file CSV lên server
    await csvFile.mv(filePath);

    const transactions = [];

    // Đọc và phân tích file CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
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

            transactions.push({
              date_time: formattedDateTime,
              trans_no: trans_no.trim(),
              credit: parseFloat(credit.trim()) || 0,
              debit: parseFloat(debit.trim()) || 0,
              detail: detail.trim(),
            });
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

    // Chèn các giao dịch vào cơ sở dữ liệu
    const insertQuery = `
      INSERT INTO chuyenkhoan (date_time, trans_no, credit, debit, detail)
      VALUES (?, ?, ?, ?, ?)
    `;

    const insertPromises = transactions.map((transaction) =>
      pool.execute(insertQuery, [
        transaction.date_time,
        transaction.trans_no,
        transaction.credit,
        transaction.debit,
        transaction.detail,
      ])
    );

    await Promise.all(insertPromises);

    // End measuring insertion time
    const insertionEndTime = Date.now();
    const timeTakenSeconds = ((insertionEndTime - insertionStartTime) / 1000).toFixed(2);

    console.log("All transactions saved to the database");
    console.log(`Insertion Time: ${timeTakenSeconds} seconds`);

    // Xóa file CSV sau khi xử lý xong
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting the file:", err);
    });

    // Redirect về trang chính với thời gian chèn vào MySQL
    res.redirect(`/?uploadTime=${timeTakenSeconds}`);
  } catch (err) {
    console.error("Error processing upload:", err);
    res.status(500).send("Error processing file.");
  }
});

// Khởi động server
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
