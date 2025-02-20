export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const signature = request.headers.get("x-paystack-signature");
  if (!validatePaystackSignature(body, signature, env.PAYSTACK_SECRET_KEY)) {
    return new Response("Invalid Signature", { status: 400 });
  }

  const { event, data } = body;
  if (event === "charge.success") {
    return await processDeposit(data, env);
  } else if (event === "transfer.success") {
    return await processWithdrawal(data, env);
  } else {
    return new Response("Invalid Event", { status: 400 });
  }
}

function validatePaystackSignature(body, signature, secretKey) {
  const crypto = require("crypto");
  const hash = crypto.createHmac("sha512", secretKey).update(JSON.stringify(body)).digest("hex");
  return hash === signature;
}

async function processDeposit(data, env) {
  if (!data || data.status !== "success") {
    return new Response("Transaction not verified", { status: 400 });
  }

  const email = data.customer.email;
  const amount = data.amount / 100;
  
  const userUid = await getUserUidByEmail(email, env);
  if (!userUid) return new Response("User not found", { status: 400 });

  await updateInvestment(userUid, amount, env);
  return new Response("Payment verified and investment updated", { status: 200 });
}

async function processWithdrawal(data, env) {
  if (!data || data.status !== "success") {
    return new Response("Transaction not verified", { status: 400 });
  }

  const email = data.recipient.details.email;
  const amount = data.amount / 100;
  const networkFee = amount * 0.07;
  const totalAmount = amount + networkFee;

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

async function updateInvestment(userUid, amount, env) {
  const userRef = `${env.FIREBASE_DATABASE_URL}/users/${userUid}.json?auth=${env.FIREBASE_SECRET}`;
  const userData = await fetch(userRef).then(res => res.json());

  await fetch(userRef, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      investment: (userData.investment || 0) + amount,
    }),
  });
}

async function updateAdminBalance(networkFee, env) {
  const usersRef = `${env.FIREBASE_DATABASE_URL}/users.json?auth=${env.FIREBASE_SECRET}`;
  const usersData = await fetch(usersRef).then(res => res.json());
  
  let adminUid = null;
  for (let userId in usersData) {
    if (usersData[userId].email === "harunalawali5522@gmail.com") {
      adminUid = userId;
      break;
    }
  }

  if (!adminUid) return;

  const adminRef = `${env.FIREBASE_DATABASE_URL}/users/${adminUid}.json?auth=${env.FIREBASE_SECRET}`;
  const adminData = await fetch(adminRef).then(res => res.json());

  await fetch(adminRef, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      networkFee: (adminData.networkFee || 0) + networkFee,
    }),
  });
}
