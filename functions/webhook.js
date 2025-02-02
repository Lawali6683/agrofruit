export default {
  async fetch(req, env) {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body;
    try {
      body = await req.json();
    } catch (error) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const signature = req.headers.get("monnify-signature");
    if (!validateMonnifySignature(body, signature, env.MONNIFY_SECRET_KEY)) {
      return new Response("Invalid Signature", { status: 400 });
    }

    const { event, transactionReference } = body;
    if (event === "SUCCESSFUL_TRANSACTION") {
      return await processDeposit(transactionReference, env);
    } else if (event === "SUCCESSFUL_WITHDRAWAL") {
      return await processWithdrawal(transactionReference, env);
    } else {
      return new Response("Invalid Event", { status: 400 });
    }
  },
};

function validateMonnifySignature(body, signature, secretKey) {
  const encoder = new TextEncoder();
  const secret = encoder.encode(atob(secretKey));
  const hash = crypto.subtle.digest("SHA-512", secret);
  return hash === signature;
}

async function fetchMonnifyTransaction(transactionReference, env) {
  const authResponse = await fetch("https://api.monnify.com/api/v1/auth/login", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.MONNIFY_API_KEY}:${env.MONNIFY_SECRET_KEY}`)}`,
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

  return await response.json();
}

async function processDeposit(transactionReference, env) {
  const transactionDetails = await fetchMonnifyTransaction(transactionReference, env);
  if (!transactionDetails.responseBody || transactionDetails.responseBody.paymentStatus !== "PAID") {
    return new Response("Transaction not verified", { status: 400 });
  }

  const email = transactionDetails.responseBody.customer.email;
  const investmentAmount = transactionDetails.responseBody.amountPaid / 100;

  const userUid = await getUserUidByEmail(email, env);
  if (!userUid) return new Response("User not found", { status: 400 });

  await updateInvestment(userUid, investment, transactionReference, env);
  return new Response("Payment verified and investment updated", { status: 200 });
}

async function processWithdrawal(transactionReference, env) {
  const transactionDetails = await fetchMonnifyTransaction(transactionReference, env);
  if (!transactionDetails.responseBody || transactionDetails.responseBody.paymentStatus !== "PAID") {
    return new Response("Transaction not verified", { status: 400 });
  }

  const email = transactionDetails.responseBody.customer.email;
  const withdrawalAmount = transactionDetails.responseBody.amountPaid / 100;
  const networkFee = withdrawalAmount * 0.07;
  const totalAmount = withdrawalAmount + networkFee;

  const userUid = await getUserUidByEmail(email, env);
  if (!userUid) return new Response("User not found", { status: 400 });

  const userRef = `${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`;
  const userData = await fetch(userRef).then(res => res.json());

  if (userData.userBalance >= totalAmount) {
    await fetch(userRef, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userBalance: userData.userBalance - totalAmount }),
    });

    await updateAdminBalance(networkFee, env);
    return new Response("Withdrawal successful", { status: 200 });
  } else {
    return new Response("Insufficient balance", { status: 400 });
  }
}

async function getUserUidByEmail(email, env) {
  const usersRef = `${env.FIREBASE_DATABASE_URL}/users.json?auth=${env.FIREBASE_SECRET}`;
  const usersData = await fetch(usersRef).then(res => res.json());

  for (let userId in usersData) {
    if (usersData[userId].email === email) {
      return userId;
    }
  }
  return null;
}

async function updateInvestment(userUid, investmentAmount, transactionReference, env) {
  const userRef = `${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`;
  const userData = await fetch(userRef).then(res => res.json());

  await fetch(userRef, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      investment: (userData.investment || 0) + investmentAmount,
    }),
  });
}

// Helper function to get the user UID by email
async function getUserUidByEmail(email, env) {
  try {
    const usersRef = admin.database().ref("users"); 
    const usersSnapshot = await usersRef.once("value"); 
    const usersData = usersSnapshot.val();
    
    for (let userId in usersData) {
      if (usersData[userId].email === email) {
        return userId; 
      }
    }

    // If no user found with email, return null
    return null;
  } catch (error) {
    console.error("Error fetching user UID:", error.message);
    return null;
  }
}

async function updateUserBalanceWithNetworkFee(email, networkFee, env) {
  const userUid = await getUserUidByEmail(email, env); 

  if (!userUid) {
    console.error("User not found.");
    return;
  }

  const userRef = `${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`;
  
  const userData = await fetch(userRef).then(res => res.json());
  
  const updatedNetworkFee = (userData.networkFee || 0) + networkFee;
  
  await fetch(userRef, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      networkFee: updatedNetworkFee,  
    }),
  });

  console.log(`User balance updated with network fee: ${networkFee}. Total network fee: ${updatedNetworkFee}`);
}
