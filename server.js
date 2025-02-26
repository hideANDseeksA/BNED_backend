require('dotenv').config();

const express = require('express');
const { Client, Pool } = require('pg');
const bcrypt = require("bcryptjs");
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const jwt = require("jsonwebtoken");

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
    const result = await client.query("SELECT * FROM resident_information");
    const decryptedData = result.rows.map(row => ({
      resident_id: row.resident_id,
      first_name: decryptData(row.first_name),
      middle_name: decryptData(row.middle_name),
      last_name: decryptData(row.last_name),
      extension_name:row.extension_name,
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
    user: 'baranggay.manogob.easy.docs@gmail.com',
    pass: 'rbfhdjzdebncbppy',
  },
});
// Function to send email
const sendEmail = async (to, subject, text,html) => {
  const mailOptions = {
    from: 'baranggay.manogob.easy.docs@gmail.com', // Update this to the sender email
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


// Add a new user with password encryption and email verification
app.post("/api/create_user", async (req, res) => {
  const { user_id, email, password,code } = req.body;

  try {

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user into the database
    await client.query(
      "INSERT INTO user_info (user_id, email, password, code) VALUES ($1, $2, $3, $4)",
      [user_id, email, hashedPassword, code]
    );

    // Formal email template
    const subject = "Barangay Easy Docs - Account Verification Code";
    const text = `Dear Resident,\n\nThank you for registering with Barangay Easy Docs. To complete your registration, please use the verification code below:\n\nVerification Code: ${code}\n\nThis code will expire in 10 minutes. If you did not request this, please ignore this email.\n\nBest regards,\nBarangay Easy Docs Support Team`;
    
    const html = `
      <p>Dear Resident,</p>
      <p>Thank you for registering with <strong>Barangay Easy Docs</strong>. To complete your registration, please use the verification code below:</p>
      <h2 style="color: #007bff;">${code}</h2>
      <p>This code will expire in <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
      <p>Best regards,<br><strong>Barangay Easy Docs Support Team</strong></p>
    `;

    // Send verification email
    await sendEmail(email, subject, text, html);

    res.status(201).json({
      message: "User added successfully. Verification code sent.",
    });
  } catch (error) {
    console.error("❌ Error adding user:", error);
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






// api for processing transaction of certificate
app.post("/certificate_transaction", async (req, res) => {
  const { resident_id, certificate_type, purpose, status, certificate_details } = req.body;
  const encryptedCertificateType = encryptData(certificate_type);
  const encryptedPurpose = encryptData(purpose);
  const encryptedStatus = encryptData(status);
  
  // Convert JSON to string before encryption
  const encryptedCertificateDetails = encryptData(JSON.stringify(certificate_details)); 

  const sql = `INSERT INTO certificate_transaction (
      resident_id, certificate_type, purpose, status, certificate_details
    ) VALUES ($1, $2, $3, $4, $5) RETURNING transaction_id`;

  const values = [
    resident_id, 
    encryptedCertificateType, 
    encryptedPurpose, 
    encryptedStatus, 
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
    const sql1 = `SELECT transaction_id, resident_id, certificate_type, purpose, status, date_requested, date_issued, certificate_details 
                  FROM certificate_transaction`;
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
      purpose: decryptData(row.purpose),
      status: decryptData(row.status),
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

  const sql = `SELECT transaction_id, resident_id, certificate_type, purpose, status, date_requested, date_issued, certificate_details 
               FROM certificate_transaction 
               WHERE resident_id = $1`;

  try {
    const result = await pool.query(sql, [resident_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "No transactions found for the given resident_id" });
    }

    // Decrypt transaction data
    const decryptedTransactions = result.rows.map(row => ({
      transaction_id: row.transaction_id,
      resident_id: row.resident_id,
      certificate_type: decryptData(row.certificate_type),
      purpose: decryptData(row.purpose),
      status: decryptData(row.status),
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

// Safe JSON parsing function
function safeParseJSON(data) {
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error("Invalid JSON format:", data);
    return null;
  }
}










// Retrieve transactions by resident_id
app.get("/certificate_transaction_history/:resident_id", async (req, res) => {
  const { resident_id } = req.params;

  const sql = `SELECT transaction_id, resident_id, certificate_type, purpose, status, date_requested, date_issued, certificate_details 
               FROM certificate_transaction_history
               WHERE resident_id = $1`;

  try {
    const result = await pool.query(sql, [resident_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "No transactions found for the given resident_id" });
    }

    // Decrypt transaction data
    const decryptedTransactions = result.rows.map(row => ({
      transaction_id: row.transaction_id,
      resident_id: row.resident_id,
      certificate_type: decryptData(row.certificate_type),
      purpose: decryptData(row.purpose),
      status: decryptData(row.status),
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


































// Fetch all book activities
app.get('/api/booksToreturned', async (req, res) => {
  try {
    const result = await client.query("SELECT book_list.*, books_activity.* FROM books_activity INNER JOIN book_list ON books_activity.book_id = book_list.book_id WHERE action_type = 'Borrowed' AND status = 'Approved' OR status = 'Overdue'");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});



//research api
app.post("/api/research", async (req, res) => {
  const { title, keyword,year, url } = req.body; // 'url' refers to the abstract_url

  try {
    // Using client to insert research data into the database
    await client.query(
      "INSERT INTO research_repository (title,keyword,year, abstract_url) VALUES ($1,$2, $3, $4)",
      [title, keyword,year, url]
    );

    res.status(201).send("Research added");
  } catch (error) {
    console.error("Error adding research:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/research/:title", async (req, res) => {
  const { title } = req.params;
  try {
    const result = await client.query("DELETE FROM research_repository WHERE id = $1", [title]);

    if (result.rowCount === 0) {
      return res.status(404).send("Book not found");
    }

    res.send("Book deleted");
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/api/research", async (req, res) => {
  try {
    const result = await client.query("SELECT * FROM research_repository");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.put("/api/research/:book_id", async (req, res) => {
  const bookId = req.params.book_id; // Current book_id from params
  const { title, keyword,year, pdf_url } = req.body; // Include the necessary fields in the request body

  try {
    // Update the book in the books table (including URL)
    const result = await client.query(
      "UPDATE research_repository SET title = $1, keyword = $2,year = $3, abstract_url = $4 WHERE id = $5",
      [title, keyword,year, pdf_url, bookId] // Use bookId here
    );

    // Check if the book was found and updated
    if (result.rowCount === 0) {
      return res.status(404).send("Book not found");
    }

    // Send back a success message or the updated book information
    res.send({ message: "Book updated successfully" });
  } catch (error) {
    console.error("Error updating book:", error);
    res.status(500).send("Internal Server Error");
  }
});




//books logs api
app.get("/api/books_history", async (req, res) => {
  try {
    const result = await client.query("SELECT book_list.*, book_history.* FROM book_history INNER JOIN book_list ON book_history.book_id = book_list.book_id ORDER BY activity_id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send("Internal Server Error");
  }
});
app.delete("/api/books_history", async (req, res) => {
  try {
    // Delete all records from books_activity table
    const result = await client.query("DELETE FROM book_history");

    // If no rows are affected, send a message indicating no books were found
    if (result.rowCount === 0) {
      return res.status(404).send("No book activities found to delete");
    }

    res.send("All book activities deleted");
  } catch (error) {
    console.error("Error deleting all book activities:", error);
    res.status(500).send("Internal Server Error");
  }
});



//add digital copies
app.post("/api/digital_copies", async (req, res) => {
  const { title, author, year, url, stocks } = req.body;
  try {
    await client.query("INSERT INTO digital_lits (title, author, year, image_url, pdf_url) VALUES ($1, $2, $3, $4, $5)", [title, author, year, url, stocks]);
    res.status(201).send("Book added");
  } catch (error) {
    console.error("Error adding book:", error);
    res.status(500).send("Internal Server Error");
  }
});

//get digital copies
app.get("/api/digital_copies", async (req, res) => {
  try {
    const result = await client.query("SELECT * FROM digital_lits ORDER BY title");
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send("Internal Server Error");
  }
});

//delete digital copies
app.delete("/api/digital_copies/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await client.query("DELETE FROM digital_lits WHERE book_id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).send("Book not found");
    }

    res.send("Book deleted");
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).send("Internal Server Error");
  }
});

//
app.post("/api/books", async (req, res) => {
  const { title, author, year, url, stocks } = req.body;
  try {
    await client.query("INSERT INTO book_list (title, author, year, url, stocks) VALUES ($1, $2, $3, $4, $5)", [title, author, year, url, stocks]);
    res.status(201).send("Book added");
  } catch (error) {
    console.error("Error adding book:", error);
    res.status(500).send("Internal Server Error");
  }
});










//insert students bulk
app.post('/api/insert_students', async (req, res) => {
  const students = req.body.students; // Assume 'students' is an array of student objects
  const Enrolled_status = true;

  try {
    const values = students.map((student) => {
      const { email, First_Name, Last_Name } = student;
      const password = crypto.randomBytes(8).toString('hex');
      return [email, First_Name, Last_Name, password, Enrolled_status];
    });

    const query = `
      INSERT INTO students (email, first_name, last_name, password, enrolled) 
      VALUES ${values.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')}
    `;

    const flattenedValues = values.flat();
    await client.query(query, flattenedValues);

 // Send an email to each student with their login credentials
for (const [email, firstName, lastName, password] of values) {
  const subject = 'Your Account for MC Salik-Sik Library System';
  const html = `
    <p>Dear ${firstName} ${lastName},</p>
    <p>Your account has been created successfully. You can now log in using the following credentials:</p>
    <p><strong>Email:</strong> ${email}<br><strong>Password:</strong> ${password}</p>
    <p>Please keep this information secure.</p>
    <p><a href="https://fastupload.io/9f054b51a2992bf3" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Download MC Salik-Sik</a></p>
    <p>Best regards,<br>MC Salik-Sik Library System Team</p>
  `;

  await sendEmail(email, subject,null, html);
}

    res.status(201).send('Students added and emails sent successfully');
  } catch (error) {
    console.error('Error adding students:', error);
    res.status(500).send('Internal Server Error');
  }
});




app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
