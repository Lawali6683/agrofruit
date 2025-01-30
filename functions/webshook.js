import { createHmac } from "crypto";
import admin from "firebase-admin";
import fetch from "node-fetch";

// Firebase initialization
if (!admin.apps.length) {
  const firebaseAdminSDK = process.env.FIREBASE_ADMIN_SDK;

  if (!firebaseAdminSDK) {
    throw new Error("FIREBASE_ADMIN_SDK environment variable is not set.");
  }

  let parsedSDK;
  try {
    parsedSDK = JSON.parse(firebaseAdminSDK);
  } catch (error) {
    throw new Error("Invalid JSON in FIREBASE_ADMIN_SDK.");
  }

  admin.initializeApp({
    credential: admin.credential.cert(parsedSDK),
    databaseURL: "https://fruit-wealth-farming-default-rtdb.firebaseio.com",
  });
}

const db = admin.database();
const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY;
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY;

if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY) {
  throw new Error("Monnify API credentials not found.");
}

// Validate Monnify webhook signature
function validateMonnifySignature(req, signature) {
  const secret = Buffer.from(MONNIFY_SECRET_KEY, "base64");
  const hash = createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return hash === signature;
}

// Verify payment status
async function verifyPayment(transactionReference) {
  try {
    const authResponse = await fetch("https://api.monnify.com/api/v1/auth/login", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });

    const authData = await authResponse.json();
    const accessToken = authData.responseBody.accessToken;

    const response = await fetch(
      `https://api.monnify.com/api/v2/transactions/${transactionReference}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();
    if (data.responseBody && data.responseBody.paymentStatus === "PAID") {
      return data.responseBody;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error verifying payment:", error.message);
    return null;
  }
}

// Webhook handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed.");
  }

  if (!req.body || !req.headers["monnify-signature"]) {
    return res.status(400).send("Invalid Request.");
  }

  const signature = req.headers["monnify-signature"];
  if (!validateMonnifySignature(req, signature)) {
    return res.status(400).send("Invalid signature.");
  }

  const { event, transactionReference } = req.body;

  if (event === "SUCCESSFUL_TRANSACTION") {
    try {
      const transactionDetails = await verifyPayment(transactionReference);

      if (transactionDetails) {
        const email = transactionDetails.customer.email;
        const userUid = await getUserUidByEmail(email);

        if (userUid) {
          const alreadyProcessed = await checkTransactionProcessed(userUid, transactionReference);

          if (alreadyProcessed) {
            return res.status(400).send("Transaction already processed.");
          }

          const investmentAmount = transactionDetails.amountPaid / 100;
          await updateInvestment(userUid, investmentAmount, transactionReference);

          // Process user balance update
          const withdrawalAmount = transactionDetails.amountPaid / 100;
          const networkFee = withdrawalAmount * 0.07;
          const totalAmount = withdrawalAmount + networkFee;

          const userRef = db.ref(`users/${userUid}`);
          const userSnapshot = await userRef.once("value");
          const userData = userSnapshot.val();

          if (userData.userBalance >= totalAmount) {
            await userRef.update({
              userBalance: userData.userBalance - totalAmount,
              lastWithdrawalStatus: "Success",
            });

            // Update network fee for admin user
            const adminEmail = "harunalawali5522@gmail.com";
            const adminUid = await getUserUidByEmail(adminEmail);
            if (adminUid) {
              const adminRef = db.ref(`users/${adminUid}`);
              const adminSnapshot = await adminRef.once("value");
              const adminData = adminSnapshot.val();

              const updatedNetworkFee = (adminData.ribarNetworkFee || 0) + networkFee;
              await adminRef.update({
                ribarNetworkFee: updatedNetworkFee,
              });
            } else {
              console.error("Admin user not found.");
            }

            return res.status(200).send("Payment verified and investment updated.");
          } else {
            return res.status(400).send("Insufficient balance.");
          }
        } else {
          return res.status(400).send("User not found.");
        }
      } else {
        return res.status(400).send("Payment verification failed.");
      }
    } catch (error) {
      console.error("Error processing deposit:", error.message);
      return res.status(500).send("Internal Server Error.");
    }
  } else if (event === "SUCCESSFUL_WITHDRAWAL") {
    try {
      const withdrawalDetails = await verifyPayment(transactionReference);

      if (withdrawalDetails) {
        const email = withdrawalDetails.customer.email;
        const userUid = await getUserUidByEmail(email);

        if (userUid) {
          const userRef = db.ref(`users/${userUid}`);
          const userSnapshot = await userRef.once("value");
          const userData = userSnapshot.val();

          const withdrawalAmount = withdrawalDetails.amountPaid / 100;
          const networkFee = withdrawalAmount * 0.07;
          const totalAmount = withdrawalAmount + networkFee;

          if (userData.userBalance >= totalAmount) {
            await userRef.update({
              userBalance: userData.userBalance - totalAmount,
              lastWithdrawalStatus: "Success",
            });

            // Update network fee for admin user
            const adminEmail = "harunalawali5522@gmail.com";
            const adminUid = await getUserUidByEmail(adminEmail);
            if (adminUid) {
              const adminRef = db.ref(`users/${adminUid}`);
              const adminSnapshot = await adminRef.once("value");
              const adminData = adminSnapshot.val();

              const updatedNetworkFee = (adminData.ribarNetworkFee || 0) + networkFee;
              await adminRef.update({
                ribarNetworkFee: updatedNetworkFee,
              });
            } else {
              console.error("Admin user not found.");
            }

            return res.status(200).send("Withdrawal success.");
          } else {
            return res.status(400).send("Insufficient balance.");
          }
        } else {
          return res.status(400).send("User not found.");
        }
      } else {
        return res.status(400).send("Withdrawal verification failed.");
      }
    } catch (error) {
      console.error("Error processing withdrawal:", error.message);
      return res.status(500).send("Internal Server Error.");
    }
  } else {
    return res.status(400).send("Invalid event.");
  }
}

// Helper functions
async function getUserUidByEmail(email) {
  try {
    const usersRef = db.ref("users");
    const usersSnapshot = await usersRef.once("value");
    const usersData = usersSnapshot.val();

    for (let userId in usersData) {
      if (usersData[userId].email === email) {
        return userId;
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching user UID:", error.message);
    return null;
  }
}

async function checkTransactionProcessed(userUid, transactionReference) {
  try {
    const userRef = db.ref(`users/${userUid}/transactions`);
    const userSnapshot = await userRef.once("value");
    const userData = userSnapshot.val();

    return userData ? userData.includes(transactionReference) : false;
  } catch (error) {
    console.error("Error checking transaction:", error.message);
    return false;
  }
}

async function updateInvestment(userUid, investmentAmount, transactionReference) {
  try {
    const userRef = db.ref(`users/${userUid}`);
    const userSnapshot = await userRef.once("value");
    const userData = userSnapshot.val();

    if (!userData) {
      throw new Error("User data not found.");
    }

    const newInvestment = (userData.investment || 0) + investmentAmount;
    const updatedTransactions = userData.transactions
      ? [...userData.transactions, transactionReference]
      : [transactionReference];

    await userRef.update({
      investment: newInvestment,
      transactions: updatedTransactions,
    });
  } catch (error) {
    console.error("Error updating investment:", error.message);
    throw error;
  }
} 
