require('dotenv').config();

const express = require('express');
const { Client, Pool } = require('pg');
const bcrypt = require("bcryptjs");
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Configuration
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Connect to the PostgreSQL database
client.connect()
  .then(() => console.log('PostgreSQL client connected successfully'))
  .catch(err => console.error('Connection error', err.stack));

// Middleware
app.use(express.json());
app.use(cors()); // Enable CORS for all origins

const ENCRYPTION_KEY = "1234567890abcdef1234567890abcdef"; // 32 bytes key
const IV_LENGTH = 16; // AES block size

// Encrypt function
const encryptData = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

// Decrypt function
const decryptData = (text) => {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts[0], "hex");
  const encryptedText = Buffer.from(textParts[1], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};


//residents api

// ✅ Bulk Insert Residents with Encryption
app.post("/api/create_residents", async (req, res) => {
  const residents = req.body.residents; // Expecting an array of residents

  if (!Array.isArray(residents) || residents.length === 0) {
    return res.status(400).send("Invalid data format");
  }

  try {
    const values = residents.map(resident => [
      encryptData(resident.first_name),
      encryptData(resident.middle_name),
      encryptData(resident.last_name),
      resident.extension_name || null, // Store as plain text (not encrypted)
      resident.age,
      encryptData(resident.address),
      resident.sex,
      encryptData(resident.status),
      encryptData(resident.birthplace),
      resident.birthday
    ]);

    // Corrected placeholder count (10 per resident)
    const query = `
      INSERT INTO resident_information 
      (first_name, middle_name, last_name, extension_name, age, address, sex, status, birthplace, birthday) 
      VALUES ${values.map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`).join(", ")}
    `;

    const flatValues = values.flat();
    await client.query(query, flatValues);

    res.status(201).send("Residents added successfully");
  } catch (error) {
    console.error("Error adding residents:", error);
    res.status(500).send("Internal Server Error");
  }
});

// const allowedOrigins = ["http://localhost:3002"];

// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error("Not allowed by CORS"));
//     }
//   },
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   credentials: true
// }));

// ✅ Single Insert Resident with Encryption
app.post("/api/create_resident", async (req, res) => {
  const resident = req.body;

  if (!resident || !resident.first_name || !resident.last_name || !resident.age || !resident.sex || !resident.birthday) {
    return res.status(400).send("Invalid data format");
  }

  try {
    const query = `
      INSERT INTO resident_information 
      (first_name, middle_name, last_name, extension_name, age, address, sex, status, birthplace, birthday) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    const values = [
      encryptData(resident.first_name),
      encryptData(resident.middle_name),
      encryptData(resident.last_name),
      resident.extension_name || null,
      resident.age,
      encryptData(resident.address),
      resident.sex.charAt(0).toUpperCase(),
      encryptData(resident.status),
      encryptData(resident.birthplace),
      resident.birthday
    ];

    await client.query(query, values);
    res.status(201).send("Resident added successfully");
  } catch (error) {
    console.error("Error adding resident:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ✅ Update Resident with Encryption
app.put("/api/update_resident/:id", async (req, res) => {
  const residentId = req.params.id;
  const resident = req.body;

  try {
    const query = `
      UPDATE resident_information SET
      first_name = $1,
      middle_name = $2,
      last_name = $3,
      extension_name = $4,
      age = $5,
      address = $6,
      sex = $7,
      status = $8,
      birthplace = $9,
      birthday = $10
      WHERE resident_id = $11
    `;

    const values = [
      encryptData(resident.first_name),
      encryptData(resident.middle_name),
      encryptData(resident.last_name),
      resident.extension_name || null,
      resident.age,
      encryptData(resident.address),
      resident.sex.charAt(0).toUpperCase(),
      encryptData(resident.status),
      encryptData(resident.birthplace),
      resident.birthday,
      residentId
    ];

    await client.query(query, values);
    res.status(200).send("Resident updated successfully");
  } catch (error) {
    console.error("Error updating resident:", error);
    res.status(500).send("Internal Server Error");
  }
});
//bulk update residents
app.put("/api/update_residents", async (req, res) => {
  const residents = req.body.residents; // Expecting an array of residents with resident_id

  if (!Array.isArray(residents) || residents.length === 0) {
    return res.status(400).send("Invalid data format");
  }

  try {
    const queries = residents.map((resident, index) => {
      return {
        text: `
          UPDATE resident_information 
          SET first_name = $1, middle_name = $2, last_name = $3, extension_name = $4, 
              age = $5, address = $6, sex = $7, status = $8, birthplace = $9, birthday = $10
          WHERE resident_id = $11
        `,
        values: [
          encryptData(resident.first_name),
          encryptData(resident.middle_name),
          encryptData(resident.last_name),
          resident.extension_name || null,
          resident.age,
          encryptData(resident.address),
          resident.sex,
          encryptData(resident.status),
          encryptData(resident.birthplace),
          resident.birthday,
          resident.resident_id // Assuming resident_id is provided
        ]
      };
    });

    // Execute all queries as a transaction
    await client.query("BEGIN");
    for (const query of queries) {
      await client.query(query.text, query.values);
    }
    await client.query("COMMIT");

    res.status(200).send("Residents updated successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating residents:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ✅ Retrieve and Decrypt Residents
app.get("/api/get_resident", async (req, res) => {
  try {
    const result = await client.query("SELECT * FROM resident_information ORDER BY resident_id ASC");
    const decryptedData = result.rows.map(row => ({
      resident_id: row.resident_id,
      first_name: decryptData(row.first_name),
      middle_name: decryptData(row.middle_name),
      last_name: decryptData(row.last_name),
      extension_name: row.extension_name,
      age: row.age,
      address: decryptData(row.address),
      sex: row.sex,
      status: decryptData(row.status),
      birthplace: decryptData(row.birthplace),
      birthday: row.birthday instanceof Date
        ? new Date(row.birthday.getTime() - row.birthday.getTimezoneOffset() * 60000) // Convert to UTC
          .toISOString()
          .split("T")[0]  // Keep YYYY-MM-DD format
        : row.birthday,
      date_added: row.date_added
        ? new Date(row.date_added).toLocaleString("en-US", {
          timeZone: "Asia/Manila", // ✅ Force Philippine Time (UTC+8)
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true, // ✅ 12-hour format with AM/PM
        }).replace(",", "") // Remove the comma between date and time
        : null,

    }));


    res.status(200).json(decryptedData);
  } catch (error) {
    console.error("Error fetching residents:", error);
    res.status(500).send("Internal Server Error");
  }
});

//delete residents
app.delete("/api/delete_residents/:resident_id", async (req, res) => {
  const { resident_id } = req.params;
  try {
    const result = await client.query("DELETE FROM resident_information WHERE resident_id = $1", [resident_id]);

    if (result.rowCount === 0) {
      return res.status(404).send("Resident not found");
    }

    res.send("Resident deleted");
  } catch (error) {
    console.error("Error deleting resident:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/get_resident/:resident_id", async (req, res) => {
  const { resident_id } = req.params;

  try {
    const result = await client.query("SELECT * FROM resident_information WHERE resident_id = $1", [resident_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Resident not found" });
    }

    const row = result.rows[0];

    const decryptedData = {
      resident_id: row.resident_id,
      first_name: decryptData(row.first_name),
      middle_name: decryptData(row.middle_name),
      last_name: decryptData(row.last_name),
      extension_name: row.extension_name,
      age: row.age,
      address: decryptData(row.address),
      sex: row.sex,
      status: decryptData(row.status),
      birthplace: decryptData(row.birthplace),
      birthday: row.birthday instanceof Date
        ? new Date(row.birthday.getTime() - row.birthday.getTimezoneOffset() * 60000)
          .toISOString()
          .split("T")[0]
        : row.birthday,
      date_added: row.date_added
        ? new Date(row.date_added).toLocaleString("en-US", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }).replace(",", "")
        : null,
    };

    res.status(200).json(decryptedData);
  } catch (error) {
    console.error("Error fetching resident:", error);
    res.status(500).send("Internal Server Error");
  }
});




//email set_up

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER, // Load from environment variables
    pass: process.env.EMAIL_PASS, // Load from environment variables
  },
});
// Function to send email
const sendEmail = async (to, subject, text, html) => {
  const mailOptions = {
    from: `"Easy Docs" <${process.env.EMAIL_USER}>`,
    to: to,
    subject: subject,
    text: text,
    html: html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
  }
};



//get user
app.get('/api/get_user', async (req, res) => {
  try {
    const result = await client.query('SELECT email,user_id FROM user_info');
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: 'Failed to fetch students', details: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if the user exists
    const result = await client.query("SELECT user_id,email, password FROM user_info WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email " });
    }

    const user = result.rows[0];

    // Verify the password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate a JWT token
    const token = jwt.sign({ user_id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/check-email", async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the email exists in the database
    const result = await client.query("SELECT user_id FROM user_info WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    res.json({ message: "Email exists" });
  } catch (error) {
    console.error("Email check error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



app.post("/api/create_user", async (req, res) => {
  const { user_id, email, password, code } = req.body;

  try {
    // ✅ Check if email already exists
    const emailCheck = await client.query("SELECT email FROM user_info WHERE email = $1", [email]);
    if (emailCheck.rowCount > 0) {
      return res.status(400).json({ message: "❌ Email already exists. Please use a different email." });
    }

    // ✅ Check if user_id exists in resident_information (FIXED QUERY)
    const userIdCheck = await client.query("SELECT resident_id FROM resident_information WHERE resident_id = $1", [user_id]);
    if (userIdCheck.rowCount === 0) {
      return res.status(400).json({ message: "❌ Resident ID does not exist. Please register in the admin" });
    }

    // ✅ Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // ✅ Insert user into the database
    await client.query(
      "INSERT INTO user_info (user_id, email, password, code) VALUES ($1, $2, $3, $4)",
      [user_id, email, hashedPassword, code]
    );

    // ✅ Prepare verification email
    const subject = "Verify Your Barangay Easy Docs Account";
    const text = `Hello, Our Beloved Residents \n\nYour verification code is: ${code}\n\nPlease enter this code in the app to verify your account.\n\nIf you didn’t request this, please ignore this email.\n\nThank you,\nBarangay EasyDocs Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #2E86C1;">Barangay EasyDocs</h2>
        <p style="font-size: 16px;">Hello, Our Belove Resident</p>
        <p style="font-size: 18px;">Your verification code is:</p>
        <h2 style="background: #f4f4f4; padding: 10px; border-radius: 5px; display: inline-block;">${code}</h2>
        <p style="font-size: 16px;">Please enter this code in the app to verify your account.</p>
        <p style="color: #888; font-size: 14px;">If you didn’t request this, please ignore this email.</p>
        <p style="font-size: 16px;"><strong>Thank you,<br>Barangay Easy Docs Team</strong></p>
      </div>
    `;

    // ✅ Send verification email
    await sendEmail(email, subject, text, html);

    res.status(201).json({
      message: "✅ Account Created Succesfully!",
    });

  } catch (error) {
    console.error("❌ Error adding user:", error);

    // ✅ Return proper error message instead of generic "Internal Server Error"
    if (error.code === "23505") {
      return res.status(400).json({ message: "❌ Duplicate entry. Email or User ID already exists." });
    }

    res.status(500).json({ message: "Internal Server Error" });
  }
});


//api to update verification status
app.put("/user/update_verification", async (req, res) => {
  const { email, verified } = req.body;

  // Ensure verified is a boolean
  if (typeof verified !== "boolean") {
    return res.status(400).json({ message: "Invalid verification status" });
  }

  const sql = `UPDATE user_info 
               SET verified = $1 
               WHERE email = $2 
               RETURNING email, verified`;

  try {
    const result = await pool.query(sql, [verified, email]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Email not found" });
    }

    res.status(200).json({
      message: "Verification status updated successfully",
      email: result.rows[0].email,
      verified: result.rows[0].verified
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.put("/user/update_password", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const sql = `UPDATE user_info 
                 SET password = $1 
                 WHERE email = $2 
                 RETURNING email`;

    const result = await pool.query(sql, [hashedPassword, email]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Email not found" });
    }

    res.status(200).json({
      message: "Password updated successfully",
      email: result.rows[0].email,
      verified: result.rows[0].verified // Ensure this column exists in your DB
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// API to update verification code and send a verification email
app.put("/user/update_code", async (req, res) => {
  const { email, code } = req.body;

  // Ensure the code is a valid 6-digit number
  if (!Number.isInteger(code) || code < 100000 || code > 999999) {
    return res.status(400).json({ message: "Invalid verification code" });
  }

  const sql = `UPDATE user_info 
               SET code = $1 
               WHERE email = $2 
               RETURNING email, code`;

  try {
    const result = await pool.query(sql, [code, email]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Email not found" });
    }

    // Clear and readable email content
    const emailSubject = "Verify Your Barangay EasyDocs Account";
    const emailText = `Hello,\n\nYour verification code is: ${code}\n\nPlease enter this code in the app to verify your account.\n\nIf you didn’t request this, please ignore this email.\n\nThank you,\nBarangay EasyDocs Team`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #2E86C1;">Barangay EasyDocs</h2>
        <p style="font-size: 16px;">Hello,</p>
        <p style="font-size: 18px;">Your verification code is:</p>
        <h2 style="background: #f4f4f4; padding: 10px; border-radius: 5px; display: inline-block;">${code}</h2>
        <p style="font-size: 16px;">Please enter this code in the app to verify your account.</p>
        <p style="color: #888; font-size: 14px;">If you didn’t request this, please ignore this email.</p>
        <p style="font-size: 16px;"><strong>Thank you,<br>Barangay EasyDocs Team</strong></p>
      </div>
    `;

    await sendEmail(email, emailSubject, emailText, emailHtml);

    res.status(200).json({
      message: "Verification code updated and email sent successfully",
      email: result.rows[0].email,
      code: result.rows[0].code
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.get("/user/verify_email/:email", async (req, res) => {
  const { email } = req.params;

  const sql = `
    SELECT user_info.verified, resident_information.* 
    FROM resident_information 
    INNER JOIN user_info 
    ON user_info.user_id = resident_information.resident_id 
    WHERE user_info.email = $1
  `;

  try {
    const result = await pool.query(sql, [email]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Email not found or no resident data available" });
    }

    const user = result.rows[0];

    res.status(200).json({
      email: email,
      verified: user.verified,
      resident_info: {
        resident_id: user.resident_id,
        first_name: decryptData(user.first_name),
        middle_name: decryptData(user.middle_name),
        last_name: decryptData(user.last_name),
        extension_name: user.extension_name,
        age: user.age,
        address: decryptData(user.address),
        sex: user.sex,
        status: decryptData(user.status),
        birthplace: decryptData(user.birthplace),
        birthday: user.birthday instanceof Date
          ? new Date(user.birthday.getTime() - user.birthday.getTimezoneOffset() * 60000)
            .toISOString()
            .split("T")[0]
          : user.birthday,
        date_added: user.date_added
          ? new Date(user.date_added).toLocaleString("en-US", {
            timeZone: "Asia/Manila",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }).replace(",", "")
          : null,
      },
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

app.post('/send-notification', async (req, res) => {
  const { email, requestId, status,message } = req.body;

  if (!email || !requestId || !status) {
    return res.status(400).json({ error: 'Email, Request ID, and Status are required fields.' });
  }

  const subject = `Great news! Your request #${requestId} has been updated`;
  const text = `Hello there!\n\nWe just wanted to let you know that your request (ID: ${requestId}) is now '${status}'.\n\nIf you need any help or have questions, feel free to reach out. We're happy to assist you!\n\nBest regards,\nYour Barangay Manogob Team`;

  const html = `
   
<div style="display: flex; justify-content: center; align-items: center;">
<img src="https://womlhdbniiweqaeevwll.supabase.co/storage/v1/object/public/images/header.png" 
     alt="Header Image" 
     style="margin-top: 20px; width: 100%; max-width: 500px; height: 250px; border-radius: 5px;">

</div>   

<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
    
    <!-- Main Content -->
    <div style="padding: 20px;">
        <h3 style="color: #2E86C1; text-align: center;">Barangay Easy Docs Request Update</h3>
        <p style="font-size: 12px; margin-bottom: 20px;">Hello, Our Beloved Residents</p>
        <p style="font-size: 12px;">${message}/p>
        <p style="font-size: 12px;">Transaction ID: <strong>${requestId}</strong></p>
        <hr style="border: 0; height: 1px; background: #ddd; margin: 20px 0;">
        <p style="font-size: 12px;">If you need any help or have questions, feel free to reach out. We're happy to assist you!</p>
    </div>
    <!-- Blue Footer -->
    <div style="background-color: #2E86C1; color: white; padding: 15px; text-align: center; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
        <p style="font-size: 12px;">Thank you for using Barangay Easy Docs services.</p>
        <p style="font-size: 12px;"><strong>Best regards,<br>Barangay Easy Docs Team</strong></p>
    </div>

</div>


  `;

  try {
    await sendEmail(email, subject, text, html);
    res.status(200).json({ message: 'Email notification has been successfully sent.' });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while sending the email notification.' });
  }
});



// api for processing transaction of certificate
app.post("/certificate_transaction", async (req, res) => {
  const { resident_id, certificate_type, status, certificate_details } = req.body;
  const encryptedCertificateType = encryptData(certificate_type);


  // Convert JSON to string before encryption
  const encryptedCertificateDetails = encryptData(JSON.stringify(certificate_details));

  const sql = `INSERT INTO certificate_transaction (
      resident_id, certificate_type, status, certificate_details
    ) VALUES ($1, $2, $3, $4) RETURNING transaction_id`;

  const values = [
    resident_id,
    encryptedCertificateType,
    status,
    encryptedCertificateDetails // Store as text
  ];

  try {
    const result = await pool.query(sql, values);
    res.status(201).json({ message: "Transaction added successfully", transaction_id: result.rows[0].transaction_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});

// get all current transaction
app.get("/api/get_transaction", async (req, res) => {
  try {
    // First SQL Query: Get all certificate transactions
    const sql1 = `SELECT transaction_id, resident_id, certificate_type,  status, date_requested, date_issued, certificate_details 
                  FROM certificate_transaction ORDER BY transaction_id`;
    const result1 = await pool.query(sql1);

    // Check if transactions exist
    if (result1.rowCount === 0) {
      return res.status(200).json({ transactions: [] });
    }

    // Decrypt transaction data
    const decryptedTransactions = result1.rows.map(row => ({
      transaction_id: row.transaction_id,
      resident_id: row.resident_id,
      certificate_type: decryptData(row.certificate_type),
      status: row.status,
      date_requested: row.date_requested,
      date_issued: row.date_issued,
      certificate_details: safeParseJSON(decryptData(row.certificate_details)), // Convert JSON safely
    }));

    // Extract unique resident_ids from transactions
    const residentIds = [...new Set(decryptedTransactions.map(t => t.resident_id))];

    // Fetch resident details for all related resident_ids
    let residentMap = {};
    if (residentIds.length > 0) {
      const sql2 = `SELECT user_id, email FROM user_info WHERE user_id = ANY($1)`;
      const result2 = await pool.query(sql2, [residentIds]);

      if (result2.rowCount > 0) {
        // Create a map of resident_id to email
        residentMap = result2.rows.reduce((map, row) => {
          map[row.user_id] = row.email;
          return map;
        }, {});
      }
    }

    // Merge resident email into transactions
    const transactionsWithResidents = decryptedTransactions.map(transaction => ({
      ...transaction,
      resident_email: residentMap[transaction.resident_id] || null, // Add email or null if not found
    }));

    // Send Response
    res.status(200).json({ transactions: transactionsWithResidents });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Retrieve transactions by resident_id
app.get("/certificate_transaction/:resident_id", async (req, res) => {
  const { resident_id } = req.params;

  const sql = `SELECT transaction_id, resident_id, certificate_type,  status, date_requested, date_issued, certificate_details 
               FROM certificate_transaction 
               WHERE resident_id = $1`;

  try {
    const result = await pool.query(sql, [resident_id]);



    // Decrypt transaction data
    const decryptedTransactions = result.rows.map(row => ({
      transaction_id: row.transaction_id,
      resident_id: row.resident_id,
      certificate_type: decryptData(row.certificate_type),
      status: row.status,
      date_requested: row.date_requested,
      date_issued: row.date_issued,
      certificate_details: JSON.parse(decryptData(row.certificate_details)), // Convert JSON safely
    }));

    res.status(200).json(decryptedTransactions);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});


app.put("/certificate_transaction/:transaction_id", async (req, res) => {
  const { status, date_issued } = req.body;
  const { transaction_id } = req.params;

  const sql = `UPDATE certificate_transaction SET status = $1, date_issued = $2 WHERE transaction_id = $3`;

  try {
    await pool.query(sql, [status, date_issued, transaction_id]);
    res.status(200).json({ message: "Transaction status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Database error" });
  }
});


// Safe JSON parsing function
function safeParseJSON(data) {
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error("Invalid JSON format:", data);
    return null;
  }
}



// get all current transaction
app.get("/api/get_transaction_history", async (req, res) => {
  try {
    // Optimized SQL Query: Fetch transaction history & join with user email
    const sql = `
      SELECT 
        cth.transaction_id, 
        cth.resident_id, 
        cth.certificate_type, 
        cth.status, 
        cth.date_requested, 
        cth.date_issued, 
        cth.certificate_details, 
        ui.email AS resident_email
      FROM certificate_transaction_history cth
      LEFT JOIN user_info ui ON cth.resident_id = ui.user_id
      ORDER BY cth.transaction_id DESC
    `;

    const result = await pool.query(sql);

    if (result.rowCount === 0) {
      return res.status(200).json({ transactions: [] });
    }

    // Decrypt transaction data
    const transactions = result.rows.map(row => ({
      transaction_id: row.transaction_id,
      resident_id: row.resident_id,
      certificate_type: decryptData(row.certificate_type),
      status: row.status,
      date_requested: row.date_requested,
      date_issued: row.date_issued,
      certificate_details: safeParseJSON(decryptData(row.certificate_details)), // Safe JSON parse
      resident_email: row.resident_email || null, // Ensure null if email not found
    }));

    // Send Response
    res.status(200).json({ transactions });

  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});



app.delete("/api/delete_transactions_history", async (req, res) => {
  try {
    await client.query("DELETE FROM certificate_transaction_history");
    res.send("History deleted");
  } catch (error) {
    console.error("Error deleting history:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Retrieve transactions by resident_id
app.get("/certificate_transaction_history/:resident_id", async (req, res) => {
  const { resident_id } = req.params;

  const sql = `SELECT transaction_id, resident_id, certificate_type,  status, date_requested, date_issued, certificate_details 
               FROM certificate_transaction_history
               WHERE resident_id = $1`;

  try {
    const result = await pool.query(sql, [resident_id]);



    const decryptedTransactions = result.rows.map(row => ({
      transaction_id: row.transaction_id,
      resident_id: row.resident_id,
      certificate_type: decryptData(row.certificate_type),

      status: row.status,
      date_requested: row.date_requested,
      date_issued: row.date_issued,
      certificate_details: JSON.parse(decryptData(row.certificate_details)), // Convert JSON safely
    }));

    res.status(200).json(decryptedTransactions);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

const TEMPLATE_FIELDS = {
  indigency: ["fullName", "age", "purok", "maritalStatus", "purpose"],
  good_moral: ["fullName", "age", "purok", "maritalStatus", "purpose"],
  clearance: ["name", "purpose", "date_issued"]
};

app.post("/api/generate-certificate", (req, res) => {
  const { templateName, ...data } = req.body;

  try {
    // Validate template name
    if (!TEMPLATE_FIELDS[templateName]) {
      return res.status(400).send("Invalid template name.");
    }

    // Validate required fields for the selected template
    const requiredFields = TEMPLATE_FIELDS[templateName];
    for (const field of requiredFields) {
      if (!data[field]) {
        return res.status(400).send(`Missing required field: ${field}`);
      }
    }

    // Get current date details
    const date = new Date();
    const day = date.getDate();
    const month = date.toLocaleString("en-US", { month: "long" });
    const year = date.getFullYear();

    // Convert day number to ordinal (e.g., 1st, 2nd, 3rd)
    const getOrdinal = (n) => {
      if (n > 3 && n < 21) return `${n}th`; // Covers 11th-19th
      switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
      }
    };

    // Add date fields to the data object for indigency templates
    if (templateName === "indigency", "good_moral") {
      data.dayth = getOrdinal(day);
      data.month = month;
      data.year = year;
    }

    // Construct the template file path dynamically
    const templatePath = path.join(__dirname, "templates", `${templateName}.docx`);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).send("Template not found.");
    }

    // Load the DOCX template
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    // Render the template with dynamic data
    doc.render(data);

    // Generate the DOCX file as a buffer
    const buffer = doc.getZip().generate({ type: "nodebuffer" });

    // Set headers for file download
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${data.fullName || "certificate"}_${templateName}.docx"`);

    // Send the file directly to the client
    res.send(buffer);
  } catch (error) {
    res.status(500).send("Error generating certificate: " + error.message);
  }
});



app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

